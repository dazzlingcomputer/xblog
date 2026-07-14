import type { Env, Settings } from "../types";

const KV_KEY = "xblog:settings";

export function defaultSettings(): Settings {
  return {
    siteTitle: "Xblog",
    siteSubtitle: "记录生活，分享思考",
    favicon: "",
    avatar: "",
    background: { type: "none", url: "", overlayOpacity: 0.35 },
    verticalTabs: false,
    glassBlur: 18,
    accentColor: "#5b8def",
    notice: "欢迎来到 Xblog ✨ 这是一段可在后台修改的公告。",
    pinnedSlugs: [],
    adminPasswordHash: "",
    icp: "",
    footerText: "Powered by Xblog",
    socialLinks: [],
  };
}

export interface LockedFields {
  siteTitle: boolean;
  siteSubtitle: boolean;
  favicon: boolean;
  avatar: boolean;
  background: boolean;
  verticalTabs: boolean;
  accentColor: boolean;
  adminPassword: boolean;
}

/** 记录哪些字段被环境变量锁定，供管理面板提示使用 */
export function getLockedFields(env: Env): LockedFields {
  return {
    siteTitle: !!env.SITE_TITLE,
    siteSubtitle: !!env.SITE_SUBTITLE,
    favicon: !!env.SITE_FAVICON,
    avatar: !!env.SITE_AVATAR,
    background: !!(env.SITE_BACKGROUND_URL || env.SITE_BACKGROUND_TYPE),
    verticalTabs: env.SITE_VERTICAL_TABS !== undefined,
    accentColor: !!env.SITE_ACCENT_COLOR,
    adminPassword: !!env.ADMIN_PASSWORD,
  };
}

export async function getSettings(env: Env): Promise<Settings> {
  let stored: Partial<Settings> = {};
  try {
    const raw = await env.SETTINGS_KV.get(KV_KEY);
    if (raw) stored = JSON.parse(raw);
  } catch (e) {
    console.error("读取设置失败", e);
  }
  const merged: Settings = { ...defaultSettings(), ...stored };
  merged.background = { ...defaultSettings().background, ...(stored.background || {}) };
  merged.socialLinks = stored.socialLinks || [];
  merged.pinnedSlugs = stored.pinnedSlugs || [];

  // ---- 环境变量覆盖 (优先级最高) ----
  if (env.SITE_TITLE) merged.siteTitle = env.SITE_TITLE;
  if (env.SITE_SUBTITLE) merged.siteSubtitle = env.SITE_SUBTITLE;
  if (env.SITE_FAVICON) merged.favicon = env.SITE_FAVICON;
  if (env.SITE_AVATAR) merged.avatar = env.SITE_AVATAR;
  if (env.SITE_BACKGROUND_URL) merged.background.url = env.SITE_BACKGROUND_URL;
  if (env.SITE_BACKGROUND_TYPE) merged.background.type = env.SITE_BACKGROUND_TYPE as any;
  if (env.SITE_VERTICAL_TABS !== undefined) merged.verticalTabs = env.SITE_VERTICAL_TABS === "true";
  if (env.SITE_ACCENT_COLOR) merged.accentColor = env.SITE_ACCENT_COLOR;

  return merged;
}

export async function saveSettings(env: Env, patch: Partial<Settings>): Promise<Settings> {
  const current = await getRawSettings(env);
  // 过滤掉 undefined 字段，避免表单中被禁用（锁定）的输入项把已保存的值覆盖为 undefined
  const cleanPatch: Record<string, unknown> = {};
  Object.entries(patch).forEach(([k, v]) => {
    if (v !== undefined) cleanPatch[k] = v;
  });
  const next: Settings = { ...defaultSettings(), ...current, ...cleanPatch };
  await env.SETTINGS_KV.put(KV_KEY, JSON.stringify(next));
  return getSettings(env);
}

async function getRawSettings(env: Env): Promise<Partial<Settings>> {
  try {
    const raw = await env.SETTINGS_KV.get(KV_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyAdminPassword(env: Env, input: string): Promise<boolean> {
  if (env.ADMIN_PASSWORD) return input === env.ADMIN_PASSWORD;
  const settings = await getRawSettings(env);
  if (!settings.adminPasswordHash) {
    // 初始密码：admin
    return input === "admin";
  }
  const hash = await sha256Hex(input);
  return hash === settings.adminPasswordHash;
}

export async function changeAdminPassword(env: Env, newPassword: string): Promise<boolean> {
  if (env.ADMIN_PASSWORD) return false; // 环境变量优先级最高，禁止后台修改
  const hash = await sha256Hex(newPassword);
  await saveSettings(env, { adminPasswordHash: hash });
  return true;
}
