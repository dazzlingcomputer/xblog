import type { Env, GithubUser } from "../types";

function getSecret(env: Env): string {
  return env.SESSION_SECRET || "xblog-default-secret-please-change";
}

async function hmac(env: Env, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret(env)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function b64url(s: string): string {
  return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64url(s: string): string {
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  return decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad)));
}

// ---------------- 管理员会话 ----------------
export async function createAdminSession(env: Env): Promise<string> {
  const payload = `admin:${Date.now()}`;
  const sig = await hmac(env, payload);
  return `${b64url(payload)}.${sig}`;
}

export async function verifyAdminSession(env: Env, token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const [b64, sig] = token.split(".");
  if (!b64 || !sig) return false;
  try {
    const payload = unb64url(b64);
    const expected = await hmac(env, payload);
    if (expected !== sig) return false;
    const ts = parseInt(payload.split(":")[1], 10);
    // 会话 7 天有效
    return Date.now() - ts < 7 * 24 * 3600 * 1000;
  } catch {
    return false;
  }
}

// ---------------- 访客 GitHub OAuth 会话 ----------------
export interface UserSessionData {
  login: string;
  avatar_url: string;
  html_url: string;
  token: string;
  ts: number;
}

export async function createUserSession(env: Env, user: GithubUser, token: string): Promise<string> {
  const data: UserSessionData = { login: user.login, avatar_url: user.avatar_url, html_url: user.html_url, token, ts: Date.now() };
  const payload = JSON.stringify(data);
  const sig = await hmac(env, payload);
  return `${b64url(payload)}.${sig}`;
}

export async function verifyUserSession(env: Env, cookieVal: string | undefined): Promise<UserSessionData | null> {
  if (!cookieVal) return null;
  const [b64, sig] = cookieVal.split(".");
  if (!b64 || !sig) return null;
  try {
    const payload = unb64url(b64);
    const expected = await hmac(env, payload);
    if (expected !== sig) return null;
    const data = JSON.parse(payload) as UserSessionData;
    if (Date.now() - data.ts > 30 * 24 * 3600 * 1000) return null;
    return data;
  } catch {
    return null;
  }
}

// ---------------- GitHub OAuth 流程 ----------------
export function buildAuthorizeUrl(env: Env, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID || "",
    redirect_uri: redirectUri,
    scope: "public_repo",
    state,
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export async function exchangeCodeForToken(env: Env, code: string, redirectUri: string): Promise<string | null> {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as any;
  return json.access_token || null;
}

export async function fetchGithubUser(token: string): Promise<GithubUser | null> {
  const res = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "xblog-worker",
      Accept: "application/vnd.github+json",
    },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as any;
  return { login: json.login, avatar_url: json.avatar_url, html_url: json.html_url };
}

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  header.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx > -1) {
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      out[k] = decodeURIComponent(v);
    }
  });
  return out;
}
