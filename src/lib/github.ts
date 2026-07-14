import type { Env } from "../types";

function apiBase() {
  return "https://api.github.com";
}

export function ghHeaders(token: string, accept = "application/vnd.github+json") {
  return {
    Authorization: `Bearer ${token}`,
    Accept: accept,
    "User-Agent": "xblog-worker",
    "X-GitHub-Api-Version": "2022-11-28",
  } as Record<string, string>;
}

function branch(env: Env) {
  return env.GITHUB_BRANCH || "main";
}

/** base64 编解码 (兼容 Unicode) */
export function b64EncodeUnicode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}
export function b64DecodeUnicode(b64: string): string {
  const binary = atob(b64.replace(/\n/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export interface GhFile {
  content: string; // base64
  sha: string;
  size: number;
  encoding: string;
}

/** 读取仓库文件内容，不存在返回 null */
export async function getFile(env: Env, path: string): Promise<GhFile | null> {
  const url = `${apiBase()}/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${encodeURI(
    path
  )}?ref=${branch(env)}`;
  const res = await fetch(url, { headers: ghHeaders(env.GITHUB_TOKEN) });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`GitHub getFile 失败(${res.status}): ${await safeText(res)}`);
  }
  const json = (await res.json()) as any;
  if (Array.isArray(json)) return null; // 是目录
  return { content: json.content, sha: json.sha, size: json.size, encoding: json.encoding };
}

/** 创建或更新文件 */
export async function putFile(
  env: Env,
  path: string,
  content: string, // 原始文本或已是 base64（由 isBase64 指定）
  message: string,
  isBase64 = false
): Promise<{ sha: string }> {
  const existing = await getFile(env, path).catch(() => null);
  const url = `${apiBase()}/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${encodeURI(path)}`;
  const body: Record<string, unknown> = {
    message,
    content: isBase64 ? content : b64EncodeUnicode(content),
    branch: branch(env),
  };
  if (existing) body.sha = existing.sha;
  const res = await fetch(url, {
    method: "PUT",
    headers: ghHeaders(env.GITHUB_TOKEN),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`GitHub putFile 失败(${res.status}): ${await safeText(res)}`);
  }
  const json = (await res.json()) as any;
  return { sha: json.content?.sha };
}

export async function deleteFile(env: Env, path: string, message: string): Promise<void> {
  const existing = await getFile(env, path);
  if (!existing) return;
  const url = `${apiBase()}/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${encodeURI(path)}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: ghHeaders(env.GITHUB_TOKEN),
    body: JSON.stringify({ message, sha: existing.sha, branch: branch(env) }),
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`GitHub deleteFile 失败(${res.status}): ${await safeText(res)}`);
  }
}

export async function listDir(env: Env, path: string): Promise<{ name: string; path: string; type: string }[]> {
  const url = `${apiBase()}/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${encodeURI(
    path
  )}?ref=${branch(env)}`;
  const res = await fetch(url, { headers: ghHeaders(env.GITHUB_TOKEN) });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`GitHub listDir 失败(${res.status}): ${await safeText(res)}`);
  const json = (await res.json()) as any;
  return Array.isArray(json) ? json : [];
}

async function safeText(res: Response) {
  try {
    return await res.text();
  } catch {
    return "<unreadable>";
  }
}
