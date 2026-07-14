import type { Env, Post, PostMeta, Friend, AboutPage } from "../types";
import { getFile, putFile, deleteFile, b64DecodeUnicode, b64EncodeUnicode } from "./github";
import { extractExcerpt } from "./markdown";

const INDEX_PATH = "data/posts/index.json";
const FRIENDS_PATH = "data/friends.json";
const ABOUT_PATH = "data/about.json";
const INDEX_CACHE_KEY = "xblog:cache:posts_index";
const CACHE_TTL = 60; // 秒

async function readJson<T>(env: Env, path: string, fallback: T): Promise<T> {
  const file = await getFile(env, path);
  if (!file) return fallback;
  try {
    return JSON.parse(b64DecodeUnicode(file.content)) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(env: Env, path: string, data: unknown, message: string) {
  await putFile(env, path, JSON.stringify(data, null, 2), message);
}

// ---------------- 文章索引（带 KV 缓存） ----------------
export async function getIndex(env: Env, forceFresh = false): Promise<PostMeta[]> {
  if (!forceFresh) {
    const cached = await env.SETTINGS_KV.get(INDEX_CACHE_KEY);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        /* ignore */
      }
    }
  }
  const list = await readJson<PostMeta[]>(env, INDEX_PATH, []);
  await env.SETTINGS_KV.put(INDEX_CACHE_KEY, JSON.stringify(list), { expirationTtl: CACHE_TTL });
  return list;
}

async function saveIndex(env: Env, list: PostMeta[]) {
  await writeJson(env, INDEX_PATH, list, "chore: update posts index");
  await env.SETTINGS_KV.put(INDEX_CACHE_KEY, JSON.stringify(list), { expirationTtl: CACHE_TTL });
}

export function slugify(title: string): string {
  const base = title
    .trim()
    .toLowerCase()
    .replace(/[^\u4e00-\u9fa5a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const rand = Math.random().toString(36).slice(2, 7);
  return base ? `${base}-${rand}` : rand;
}

export async function savePost(
  env: Env,
  input: {
    slug?: string;
    title: string;
    content: string;
    category: string;
    tags: string[];
    cover?: string;
    pinned?: boolean;
  }
): Promise<Post> {
  const list = await getIndex(env, true);
  const now = new Date().toISOString();
  const slug = input.slug || slugify(input.title);
  const existingIdx = list.findIndex((p) => p.slug === slug);
  const meta: PostMeta = {
    slug,
    title: input.title,
    excerpt: extractExcerpt(input.content),
    category: input.category || "未分类",
    tags: input.tags || [],
    cover: input.cover || "",
    createdAt: existingIdx >= 0 ? list[existingIdx].createdAt : now,
    updatedAt: now,
    pinned: !!input.pinned,
    issueNumber: existingIdx >= 0 ? list[existingIdx].issueNumber : undefined,
  };
  const post: Post = { ...meta, content: input.content };
  await writeJson(env, `data/posts/${slug}.json`, post, `post: 保存文章《${input.title}》`);
  if (existingIdx >= 0) list[existingIdx] = meta;
  else list.unshift(meta);
  await saveIndex(env, list);
  return post;
}

export async function getPost(env: Env, slug: string): Promise<Post | null> {
  return readJson<Post | null>(env, `data/posts/${slug}.json`, null);
}

export async function deletePost(env: Env, slug: string): Promise<void> {
  await deleteFile(env, `data/posts/${slug}.json`, `post: 删除文章 ${slug}`);
  const list = await getIndex(env, true);
  await saveIndex(env, list.filter((p) => p.slug !== slug));
}

export async function setPostIssueNumber(env: Env, slug: string, issueNumber: number) {
  const list = await getIndex(env, true);
  const idx = list.findIndex((p) => p.slug === slug);
  if (idx >= 0) {
    list[idx].issueNumber = issueNumber;
    await saveIndex(env, list);
  }
  const post = await getPost(env, slug);
  if (post) {
    post.issueNumber = issueNumber;
    await writeJson(env, `data/posts/${slug}.json`, post, `chore: 关联评论 issue #${issueNumber}`);
  }
}

export type SortBy = "date" | "views" | "category";

export async function listPosts(
  env: Env,
  opts: { sortBy?: SortBy; category?: string; tag?: string; page?: number; pageSize?: number } = {}
): Promise<{ items: (PostMeta & { views: number })[]; total: number; categories: string[]; tags: string[] }> {
  const list = await getIndex(env);
  let items = [...list];
  if (opts.category) items = items.filter((p) => p.category === opts.category);
  if (opts.tag) items = items.filter((p) => p.tags?.includes(opts.tag!));

  const withViews = await Promise.all(
    items.map(async (p) => ({ ...p, views: await getViews(env, p.slug) }))
  );

  const sortBy = opts.sortBy || "date";
  withViews.sort((a, b) => {
    if (sortBy === "views") return b.views - a.views;
    if (sortBy === "category") return a.category.localeCompare(b.category);
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const total = withViews.length;
  const pageSize = opts.pageSize || 10;
  const page = opts.page || 1;
  const start = (page - 1) * pageSize;
  const pageItems = withViews.slice(start, start + pageSize);

  const categories = Array.from(new Set(list.map((p) => p.category))).filter(Boolean);
  const tags = Array.from(new Set(list.flatMap((p) => p.tags || [])));

  return { items: pageItems, total, categories, tags };
}

export async function searchPosts(env: Env, query: string): Promise<PostMeta[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const list = await getIndex(env);
  return list.filter(
    (p) =>
      p.title.toLowerCase().includes(q) ||
      p.excerpt.toLowerCase().includes(q) ||
      p.category?.toLowerCase().includes(q) ||
      p.tags?.some((t) => t.toLowerCase().includes(q))
  );
}

// ---------------- 浏览量（KV 计数器） ----------------
export async function getViews(env: Env, slug: string): Promise<number> {
  const v = await env.SETTINGS_KV.get(`xblog:views:${slug}`);
  return v ? parseInt(v, 10) || 0 : 0;
}

export async function incrViews(env: Env, slug: string): Promise<number> {
  const current = await getViews(env, slug);
  const next = current + 1;
  await env.SETTINGS_KV.put(`xblog:views:${slug}`, String(next));
  return next;
}

// ---------------- 友链 ----------------
export async function getFriends(env: Env): Promise<Friend[]> {
  return readJson<Friend[]>(env, FRIENDS_PATH, []);
}
export async function saveFriends(env: Env, friends: Friend[]): Promise<void> {
  await writeJson(env, FRIENDS_PATH, friends, "chore: 更新友链");
}

// ---------------- 关于页 ----------------
export async function getAbout(env: Env): Promise<AboutPage> {
  return readJson<AboutPage>(env, ABOUT_PATH, { content: "这个人很懒，还没有写关于信息。", updatedAt: "" });
}
export async function saveAbout(env: Env, content: string): Promise<void> {
  await writeJson(env, ABOUT_PATH, { content, updatedAt: new Date().toISOString() }, "chore: 更新关于页");
}

// ---------------- 资源上传（图片/音频/视频/头像/背景/favicon） ----------------
export async function uploadAsset(
  env: Env,
  filename: string,
  base64Data: string
): Promise<{ path: string; url: string }> {
  const safe = filename.replace(/[^\w.\-\u4e00-\u9fa5]/g, "_");
  const date = new Date();
  const folder = `assets/${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}`;
  const uid = crypto.randomUUID().slice(0, 8);
  const path = `${folder}/${uid}-${safe}`;
  await putFile(env, path, base64Data, `assets: 上传 ${safe}`, true);
  return { path, url: `/files/${path}` };
}

export { b64EncodeUnicode };
