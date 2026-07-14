import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { Env } from "../types";
import { verifyUserSession } from "../lib/auth";
import { getPost, setPostIssueNumber } from "../lib/data";
import { ghHeaders } from "../lib/github";

export const commentsRoutes = new Hono<{ Bindings: Env }>();

function commentRepo(env: Env) {
  return {
    owner: env.GITHUB_COMMENT_OWNER || env.GITHUB_OWNER,
    repo: env.GITHUB_COMMENT_REPO || env.GITHUB_REPO,
  };
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
  // 创建新 issue
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

    const [commentsRes, issueRes] = await Promise.all([
      fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100`, {
        headers: ghHeaders(c.env.GITHUB_TOKEN),
      }),
      fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`, {
        headers: ghHeaders(c.env.GITHUB_TOKEN, "application/vnd.github.squirrel-girl-preview+json"),
      }),
    ]);
    const commentsJson = commentsRes.ok ? ((await commentsRes.json()) as any[]) : [];
    const issueJson = issueRes.ok ? ((await issueRes.json()) as any) : null;
    const likes = issueJson?.reactions?.["+1"] || 0;

    let liked = false;
    if (user) {
      const reactionsRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/reactions?per_page=100`,
        { headers: ghHeaders(c.env.GITHUB_TOKEN, "application/vnd.github.squirrel-girl-preview+json") }
      );
      if (reactionsRes.ok) {
        const reactions = (await reactionsRes.json()) as any[];
        liked = reactions.some((r) => r.content === "+1" && r.user?.login === user.login);
      }
    }

    return c.json({
      likes,
      liked,
      comments: commentsJson.map((cm) => ({
        login: cm.user?.login || "匿名",
        avatar: cm.user?.avatar_url || "",
        body: cm.body,
        createdAt: cm.created_at,
      })),
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
  const { owner, repo } = commentRepo(c.env);
  try {
    const issueNumber = await findOrCreateIssue(c.env, slug);
    if (!issueNumber) return c.json({ error: "评论区初始化失败" }, 500);
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
      method: "POST",
      headers: ghHeaders(user.token),
      body: JSON.stringify({ body: text }),
    });
    if (!res.ok) return c.json({ error: "发表评论失败，可能是 GitHub 授权已过期，请重新登录" }, 500);
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
    const listRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/reactions?per_page=100`,
      { headers: ghHeaders(user.token, "application/vnd.github.squirrel-girl-preview+json") }
    );
    const reactions = listRes.ok ? ((await listRes.json()) as any[]) : [];
    const mine = reactions.find((r) => r.content === "+1" && r.user?.login === user.login);
    if (mine) {
      await fetch(`https://api.github.com/repos/${owner}/${repo}/reactions/${mine.id}`, {
        method: "DELETE",
        headers: ghHeaders(user.token, "application/vnd.github.squirrel-girl-preview+json"),
      });
    } else {
      await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/reactions`, {
        method: "POST",
        headers: ghHeaders(user.token, "application/vnd.github.squirrel-girl-preview+json"),
        body: JSON.stringify({ content: "+1" }),
      });
    }
    const issueRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`, {
      headers: ghHeaders(c.env.GITHUB_TOKEN, "application/vnd.github.squirrel-girl-preview+json"),
    });
    const issueJson = issueRes.ok ? ((await issueRes.json()) as any) : null;
    return c.json({ likes: issueJson?.reactions?.["+1"] || 0, liked: !mine });
  } catch (e) {
    console.error(e);
    return c.json({ error: "点赞失败" }, 500);
  }
});
