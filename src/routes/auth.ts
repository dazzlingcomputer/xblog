import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Env } from "../types";
import { buildAuthorizeUrl, exchangeCodeForToken, fetchGithubUser, createUserSession } from "../lib/auth";
import { getSettings } from "../lib/settings";
import { errorPage } from "../lib/layout";

export const authRoutes = new Hono<{ Bindings: Env }>();

function siteUrl(c: any): string {
  if (c.env.SITE_URL) return c.env.SITE_URL.replace(/\/$/, "");
  const u = new URL(c.req.url);
  return `${u.protocol}//${u.host}`;
}

authRoutes.get("/login", async (c) => {
  const settings = await getSettings(c.env);
  if (!c.env.GITHUB_CLIENT_ID || !c.env.GITHUB_CLIENT_SECRET) {
    return c.html(
      errorPage(500, "站点尚未配置 GitHub OAuth（GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET），无法登录评论。请联系管理员在环境变量中配置。", settings)
    );
  }
  const redirectUri = `${siteUrl(c)}/callback`;
  const referer = c.req.header("referer") || "/";
  const state = encodeURIComponent(referer);
  return c.redirect(buildAuthorizeUrl(c.env, redirectUri, state));
});

authRoutes.get("/callback", async (c) => {
  const settings = await getSettings(c.env);
  const code = c.req.query("code");
  const state = c.req.query("state");
  if (!code) return c.html(errorPage(400, "GitHub 登录失败：缺少授权码", settings), 400);
  try {
    const redirectUri = `${siteUrl(c)}/callback`;
    const token = await exchangeCodeForToken(c.env, code, redirectUri);
    if (!token) return c.html(errorPage(400, "GitHub 登录失败：无法获取访问令牌", settings), 400);
    const user = await fetchGithubUser(token);
    if (!user) return c.html(errorPage(400, "GitHub 登录失败：无法获取用户信息", settings), 400);
    const session = await createUserSession(c.env, user, token);
    const isHttps = new URL(c.req.url).protocol === "https:";
    setCookie(c, "xb_user", session, { httpOnly: true, path: "/", maxAge: 30 * 24 * 3600, sameSite: "Lax", secure: isHttps });
    let back = "/";
    try {
      back = state ? decodeURIComponent(state) : "/";
      const backUrl = new URL(back, siteUrl(c));
      back = backUrl.pathname + backUrl.search;
    } catch {
      back = "/";
    }
    return c.redirect(back || "/");
  } catch (e: any) {
    console.error(e);
    return c.html(errorPage(500, "登录过程中发生错误，请稍后再试。", settings), 500);
  }
});

authRoutes.get("/logout", async (c) => {
  deleteCookie(c, "xb_user", { path: "/" });
  const referer = c.req.header("referer") || "/";
  return c.redirect(referer);
});
