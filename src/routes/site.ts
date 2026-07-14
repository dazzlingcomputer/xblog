import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { Env } from "../types";
import { getSettings } from "../lib/settings";
import { getIndex, listPosts, getPost, incrViews, getFriends, getAbout, searchPosts, getViews } from "../lib/data";
import { renderMarkdown } from "../lib/markdown";
import { layout, errorPage } from "../lib/layout";
import { verifyUserSession } from "../lib/auth";
import { getFile } from "../lib/github";

export const site = new Hono<{ Bindings: Env }>();

async function currentUser(c: any) {
  const cookie = getCookie(c, "xb_user");
  return verifyUserSession(c.env, cookie);
}

function fmtDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ---------------- 首页 ----------------
site.get("/", async (c) => {
  const settings = await getSettings(c.env);
  const user = await currentUser(c);
  const index = await getIndex(c.env);

  const pinned = index.filter((p) => settings.pinnedSlugs?.includes(p.slug) || p.pinned);
  const recent = index.filter((p) => !pinned.find((pp) => pp.slug === p.slug)).slice(0, 6);

  const cardHtml = (p: (typeof index)[number], isPinned = false) => `
    <a class="xb-post-item xb-glass xb-card" href="/posts/${p.slug}">
      <div>${isPinned ? '<span class="xb-pill pinned">📌 置顶</span>' : ""}<span class="xb-pill">${p.category}</span></div>
      <h3>${p.title}</h3>
      <p>${p.excerpt}</p>
      <div class="xb-meta"><span>🗓️ ${fmtDate(p.createdAt)}</span>${(p.tags || []).map((t) => `<span>#${t}</span>`).join("")}</div>
    </a>`;

  const content = `
    ${
      settings.notice
        ? `<div class="xb-notice xb-glass"><span style="font-size:22px;">📣</span><div><b>公告</b><div style="margin-top:4px;opacity:.85;">${settings.notice}</div></div></div>`
        : ""
    }
    ${
      pinned.length
        ? `<div class="xb-section-title">📌 置顶文章</div><div>${pinned.map((p) => cardHtml(p, true)).join("")}</div>`
        : ""
    }
    <div class="xb-section-title">🕒 最近发布</div>
    <div>${recent.length ? recent.map((p) => cardHtml(p)).join("") : '<div class="xb-empty">还没有发布任何文章</div>'}</div>
    ${index.length ? `<div style="text-align:center;margin-top:10px;"><a class="xb-btn secondary" href="/posts">查看全部文章 →</a></div>` : ""}
  `;
  return c.html(layout({ title: "", settings, active: "home", user }, content));
});

// ---------------- 文章列表 ----------------
site.get("/posts", async (c) => {
  const settings = await getSettings(c.env);
  const user = await currentUser(c);
  const sortBy = (c.req.query("sort") as any) || "date";
  const category = c.req.query("cat") || "";
  const tag = c.req.query("tag") || "";
  const page = parseInt(c.req.query("page") || "1", 10);
  const { items, total, categories, tags } = await listPosts(c.env, { sortBy, category, tag, page, pageSize: 8 });

  const sortLink = (key: string, label: string) =>
    `<a class="xb-chip ${sortBy === key ? "active" : ""}" href="?sort=${key}${category ? `&cat=${category}` : ""}${tag ? `&tag=${tag}` : ""}">${label}</a>`;

  const catLinks = categories
    .map((cat) => `<a class="xb-chip ${category === cat ? "active" : ""}" href="?sort=${sortBy}&cat=${encodeURIComponent(cat)}">${cat}</a>`)
    .join("");
  const tagLinks = tags
    .map((t) => `<a class="xb-chip ${tag === t ? "active" : ""}" href="?sort=${sortBy}&tag=${encodeURIComponent(t)}">#${t}</a>`)
    .join("");

  const list = items
    .map(
      (p) => `<a class="xb-post-item xb-glass xb-card" href="/posts/${p.slug}">
      <div>${p.pinned ? '<span class="xb-pill pinned">📌</span>' : ""}<span class="xb-pill">${p.category}</span></div>
      <h3>${p.title}</h3><p>${p.excerpt}</p>
      <div class="xb-meta"><span>🗓️ ${fmtDate(p.createdAt)}</span><span>👀 ${p.views} 次浏览</span>${(p.tags || [])
        .map((t) => `<span>#${t}</span>`)
        .join("")}</div>
    </a>`
    )
    .join("");

  const totalPages = Math.max(1, Math.ceil(total / 8));
  const pager = `<div style="display:flex;gap:8px;justify-content:center;margin-top:20px;">
    ${Array.from({ length: totalPages })
      .map(
        (_, i) =>
          `<a class="xb-chip ${page === i + 1 ? "active" : ""}" href="?sort=${sortBy}&cat=${category}&tag=${tag}&page=${i + 1}">${i + 1}</a>`
      )
      .join("")}
  </div>`;

  const content = `
    <div class="xb-section-title">📝 全部文章</div>
    <div class="xb-toolbar">排序：${sortLink("date", "🗓️ 最新发布")}${sortLink("views", "👀 浏览最多")}${sortLink("category", "🗂️ 按分类")}</div>
    ${categories.length ? `<div class="xb-toolbar">分类：<a class="xb-chip ${!category ? "active" : ""}" href="?sort=${sortBy}">全部</a>${catLinks}</div>` : ""}
    ${tags.length ? `<div class="xb-toolbar">标签：${tagLinks}</div>` : ""}
    <div>${list || '<div class="xb-empty">暂无符合条件的文章</div>'}</div>
    ${totalPages > 1 ? pager : ""}
  `;
  return c.html(layout({ title: "文章", settings, active: "posts", user }, content));
});

// ---------------- 搜索 ----------------
site.get("/search", async (c) => {
  const settings = await getSettings(c.env);
  const user = await currentUser(c);
  const q = c.req.query("q") || "";
  const results = q ? await searchPosts(c.env, q) : [];
  const list = results
    .map(
      (p) => `<a class="xb-post-item xb-glass xb-card" href="/posts/${p.slug}">
      <h3>${p.title}</h3><p>${p.excerpt}</p>
      <div class="xb-meta"><span>🗓️ ${fmtDate(p.createdAt)}</span><span class="xb-pill">${p.category}</span></div>
    </a>`
    )
    .join("");
  const content = `
    <div class="xb-section-title">🔍 搜索结果：“${q}”</div>
    <div>${q ? list || '<div class="xb-empty">没有找到相关文章</div>' : '<div class="xb-empty">请输入关键词进行搜索</div>'}</div>
  `;
  return c.html(layout({ title: "搜索", settings, active: "posts", user }, content));
});

// ---------------- 文章详情 ----------------
site.get("/posts/:slug", async (c) => {
  const settings = await getSettings(c.env);
  const user = await currentUser(c);
  const slug = c.req.param("slug");
  const post = await getPost(c.env, slug);
  if (!post) return c.html(errorPage(404, "该文章不存在或已被删除", settings), 404);
  const views = await incrViews(c.env, slug);
  const bodyHtml = renderMarkdown(post.content);

  const content = `
    <article class="xb-article xb-glass xb-card">
      ${post.cover ? `<img src="${post.cover}" style="width:100%;border-radius:14px;margin-bottom:18px;max-height:360px;object-fit:cover;"/>` : ""}
      <div><span class="xb-pill">${post.category}</span>${(post.tags || []).map((t) => `<span class="xb-pill">#${t}</span>`).join("")}</div>
      <h1>${post.title}</h1>
      <div class="xb-meta"><span>🗓️ 发布于 ${fmtDate(post.createdAt)}</span><span>♻️ 更新于 ${fmtDate(post.updatedAt)}</span><span>👀 ${views} 次浏览</span></div>
      <div class="xb-body">${bodyHtml}</div>
      <div style="margin-top:24px;">
        <input type="hidden" id="xb-post-slug" value="${slug}"/>
        <button class="xb-like-btn" id="xb-like-btn">❤️ <span id="xb-like-count">0</span> 喜欢</button>
      </div>
    </article>
    <div class="xb-comments xb-glass xb-card">
      <div class="xb-section-title" style="margin-top:0">💬 评论</div>
      ${
        user
          ? `<form id="xb-comment-form"><textarea id="xb-comment-input" class="xb-textarea" rows="3" placeholder="友善的评论会被大家看到～"></textarea><div style="margin-top:10px;text-align:right;"><button class="xb-btn" type="submit">发表评论</button></div></form>`
          : `<div class="xb-empty">请先 <a href="/login">登录 GitHub 账号</a> 后再发表评论</div>`
      }
      <div id="xb-comments-list" style="margin-top:16px;"><div class="xb-empty">加载中...</div></div>
    </div>
  `;
  return c.html(layout({ title: post.title, settings, active: "posts", user }, content));
});

// ---------------- 友链 ----------------
site.get("/friends", async (c) => {
  const settings = await getSettings(c.env);
  const user = await currentUser(c);
  const friends = await getFriends(c.env);
  const grid = friends
    .map(
      (f) => `<a class="xb-friend-card xb-glass xb-card" href="${f.url}" target="_blank" rel="noopener">
      <img src="${f.avatar}" alt="${f.name}"/><h4>${f.name}</h4><p>${f.desc}</p>
    </a>`
    )
    .join("");
  const content = `<div class="xb-section-title">🔗 友情链接</div><div class="xb-friend-grid">${
    grid || '<div class="xb-empty">暂无友链</div>'
  }</div>`;
  return c.html(layout({ title: "友链", settings, active: "friends", user }, content));
});

// ---------------- 关于 ----------------
site.get("/about", async (c) => {
  const settings = await getSettings(c.env);
  const user = await currentUser(c);
  const about = await getAbout(c.env);
  const content = `<div class="xb-article xb-glass xb-card"><div class="xb-body">${renderMarkdown(about.content)}</div></div>`;
  return c.html(layout({ title: "关于", settings, active: "about", user }, content));
});

// ---------------- GitHub 资源文件代理（图片/音频/视频/头像/封面等） ----------------
site.get("/files/*", async (c) => {
  const path = c.req.path.replace(/^\/files\//, "");
  try {
    const file = await getFile(c.env, decodeURIComponent(path));
    if (!file) return c.notFound();
    const bytes = Uint8Array.from(atob(file.content.replace(/\n/g, "")), (ch) => ch.charCodeAt(0));
    const ext = path.split(".").pop()?.toLowerCase() || "";
    const mimeMap: Record<string, string> = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
      svg: "image/svg+xml",
      ico: "image/x-icon",
      mp3: "audio/mpeg",
      wav: "audio/wav",
      m4a: "audio/mp4",
      ogg: "audio/ogg",
      mp4: "video/mp4",
      webm: "video/webm",
    };
    return c.body(bytes.buffer as ArrayBuffer, 200, {
      "Content-Type": mimeMap[ext] || "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
    });
  } catch (e) {
    console.error(e);
    return c.notFound();
  }
});
