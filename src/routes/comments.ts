import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { Env } from "../types";
import { verifyUserSession } from "../lib/auth";
import { getPost, setPostIssueNumber } from "../lib/data";
import { ghHeaders, getIssue, patchIssueBody } from "../lib/github";

export const commentsRoutes = new Hono<{ Bindings: Env }>();

function commentRepo(env: Env) {
  return {
    owner: env.GITHUB_COMMENT_OWNER || env.GITHUB_OWNER,
    repo: env.GITHUB_COMMENT_REPO || env.GITHUB_REPO,
  };
}

// ---------------------------------------------------------------------------
// 身份"嵌入 / 还原"：由于实际写入 GitHub 的操作统一使用管理员 GITHUB_TOKEN，
// 所有评论在 GitHub 上看起来都是管理员账号发的。为了在博客前端仍能展示访客
// 的真实身份，我们把访客信息编码成一段 HTML 注释，塞进评论正文最前面——
// HTML 注释在 GitHub 渲染 issue 时不会显示，纯粹是给我们自己的接口解析用的。
// ---------------------------------------------------------------------------
const VISITOR_MARK_RE = /^<!--xb-visitor:([\s\S]*?)-->\n?/;
const LIKES_MARK_RE = /<!--xb-likes:([\s\S]*?)-->/;

interface VisitorIdentity {
  login: string;
  avatar_url: string;
  html_url: string;
}

function encodeVisitorBody(user: VisitorIdentity, text: string): string {
  const mark = `<!--xb-visitor:${JSON.stringify({
    login: user.login,
    avatar: user.avatar_url,
    html_url: user.html_url,
  })}-->`;
  return `${mark}\n${text}`;
}

function decodeVisitorBody(
  raw: string,
  fallbackLogin: string,
  fallbackAvatar: string
): { login: string; avatar: string; body: string } {
  const m = raw.match(VISITOR_MARK_RE);
  if (!m) return { login: fallbackLogin, avatar: fallbackAvatar, body: raw };
  try {
    const info = JSON.parse(m[1]);
    return {
      login: info.login || fallbackLogin,
      avatar: info.avatar || fallbackAvatar,
      body: raw.slice(m[0].length),
    };
  } catch {
    return { login: fallbackLogin, avatar: fallbackAvatar, body: raw };
  }
}

// ---------------------------------------------------------------------------
// 点赞：不再使用 GitHub 原生 reactions API（那会把"点赞人"记成管理员账号，
// 且无法区分是谁点的），改为在 issue body 末尾维护一段隐藏的 JSON 点赞人列表。
// ---------------------------------------------------------------------------
function parseLikes(issueBody: string | null | undefined): string[] {
  const m = issueBody?.match(LIKES_MARK_RE);
  if (!m) return [];
  try {
    const arr = JSON.parse(m[1]);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function buildBodyWithLikes(baseBody: string, likes: string[]): string {
  const stripped = (baseBody || "").replace(LIKES_MARK_RE, "").trimEnd();
  return `${stripped}\n\n<!--xb-likes:${JSON.stringify(likes)}-->`;
}

async function findOrCreateIssue(env: Env, slug: string): Promise<number | null> {
  const post = await getPost(env, slug);
  if (post?.issueNumber) return post.issueNumber;
  const { owner, repo } = commentRepo(env);
  const title = `[评论] ${post?.title || slug} (${slug})`;
  // 先尝试搜索是否已存在
  try {
    const q = encodeURIComponent(`repo:${owner}/${repo} in:title "${slug}" type:issue`);
    const searchRes = await fetch(`https://api.github.com/search/issues?q=${q}`, { headers: ghHeaders(env.GITHUB_TOKEN) });
    if (searchRes.ok) {
      const json = (await searchRes.json()) as any;
      const found = json.items?.find((it: any) => it.title.includes(`(${slug})`));
      if (found) {
        await setPostIssueNumber(env, slug, found.number);
        return found.number;
      }
    }
  } catch (e) {
    console.error("搜索评论 issue 失败", e);
  }
  // 创建新 issue（管理员 token，私有仓库下同样可用）
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
    method: "POST",
    headers: ghHeaders(env.GITHUB_TOKEN),
    body: JSON.stringify({ title, body: `本 Issue 用于承载文章《${post?.title || slug}》的评论与点赞，请勿删除。`, labels: ["xblog-comment"] }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as any;
  await setPostIssueNumber(env, slug, json.number);
  return json.number;
}

commentsRoutes.get("/api/comments/:slug", async (c) => {
  const slug = c.req.param("slug");
  const { owner, repo } = commentRepo(c.env);
  const userCookie = getCookie(c, "xb_user");
  const user = await verifyUserSession(c.env, userCookie);
  try {
    const issueNumber = await findOrCreateIssue(c.env, slug);
    if (!issueNumber) return c.json({ comments: [], likes: 0, liked: false });

    const [commentsRes, issueJson] = await Promise.all([
      fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100`, {
        headers: ghHeaders(c.env.GITHUB_TOKEN), // 统一用管理员 token 读取，私有仓库也没问题
      }),
      getIssue(c.env, owner, repo, issueNumber),
    ]);
    const commentsJson = commentsRes.ok ? ((await commentsRes.json()) as any[]) : [];
    const likeList = parseLikes(issueJson?.body);
    const likes = likeList.length;
    const liked = !!(user && likeList.includes(user.login));

    return c.json({
      likes,
      liked,
      comments: commentsJson.map((cm) => {
        // 优先还原我们嵌入的访客身份；如果没有标记（比如管理员直接在 GitHub 网页上手动回复），
        // 就退回显示真实发布者（此时就是管理员自己的账号）。
        const decoded = decodeVisitorBody(cm.body || "", cm.user?.login || "匿名", cm.user?.avatar_url || "");
        return {
          login: decoded.login,
          avatar: decoded.avatar,
          body: decoded.body,
          createdAt: cm.created_at,
        };
      }),
    });
  } catch (e) {
    console.error(e);
    return c.json({ comments: [], likes: 0, liked: false, error: "评论加载失败" });
  }
});

commentsRoutes.post("/api/comments/:slug", async (c) => {
  const slug = c.req.param("slug");
  const userCookie = getCookie(c, "xb_user");
  const user = await verifyUserSession(c.env, userCookie);
  if (!user) return c.json({ error: "请先登录 GitHub 账号" }, 401);
  const body = await c.req.json().catch(() => ({} as any));
  const text = (body.body || "").toString().trim();
  if (!text) return c.json({ error: "评论内容不能为空" }, 400);
  if (text.length > 5000) return c.json({ error: "评论内容过长" }, 400);
  const { owner, repo } = commentRepo(c.env);
  try {
    const issueNumber = await findOrCreateIssue(c.env, slug);
    if (!issueNumber) return c.json({ error: "评论区初始化失败" }, 500);
    const wrapped = encodeVisitorBody(
      { login: user.login, avatar_url: user.avatar_url, html_url: user.html_url },
      text
    );
    // 关键改动：不再用访客自己的 token，统一用管理员 GITHUB_TOKEN 写入，
    // 因此私有仓库也能正常发表评论；访客真实身份已编码进 wrapped 正文里。
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
      method: "POST",
      headers: ghHeaders(c.env.GITHUB_TOKEN),
      body: JSON.stringify({ body: wrapped }),
    });
    if (!res.ok) return c.json({ error: "发表评论失败，请稍后再试" }, 500);
    return c.json({ ok: true });
  } catch (e) {
    console.error(e);
    return c.json({ error: "发表评论时发生异常" }, 500);
  }
});

commentsRoutes.post("/api/like/:slug", async (c) => {
  const slug = c.req.param("slug");
  const userCookie = getCookie(c, "xb_user");
  const user = await verifyUserSession(c.env, userCookie);
  if (!user) return c.json({ error: "请先登录 GitHub 账号" }, 401);
  const { owner, repo } = commentRepo(c.env);
  try {
    const issueNumber = await findOrCreateIssue(c.env, slug);
    if (!issueNumber) return c.json({ error: "初始化失败" }, 500);

    const issueJson = await getIssue(c.env, owner, repo, issueNumber);
    if (!issueJson) return c.json({ error: "点赞失败" }, 500);

    const likeList = parseLikes(issueJson.body);
    const idx = likeList.indexOf(user.login);
    let liked: boolean;
    if (idx >= 0) {
      likeList.splice(idx, 1);
      liked = false;
    } else {
      likeList.push(user.login);
      liked = true;
    }
    const newBody = buildBodyWithLikes(issueJson.body || "", likeList);
    const ok = await patchIssueBody(c.env, owner, repo, issueNumber, newBody);
    if (!ok) return c.json({ error: "点赞失败" }, 500);
    return c.json({ likes: likeList.length, liked });
  } catch (e) {
    console.error(e);
    return c.json({ error: "点赞失败" }, 500);
  }
});
