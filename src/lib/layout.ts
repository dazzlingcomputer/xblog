import type { Settings } from "../types";
import type { UserSessionData } from "./auth";

export interface LayoutOptions {
  title: string;
  settings: Settings;
  active?: "home" | "posts" | "friends" | "about" | "";
  user?: UserSessionData | null;
  bodyClass?: string;
  head?: string;
}

function hexToRgb(hex: string): string {
  const m = hex.replace("#", "");
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const int = parseInt(full, 16);
  if (isNaN(int)) return "91 141 239";
  return `${(int >> 16) & 255} ${(int >> 8) & 255} ${int & 255}`;
}

function renderBackground(settings: Settings): string {
  if (!settings.background?.url || settings.background.type === "none") return "";
  if (settings.background.type === "video") {
    return `<div class="xb-bg-fixed"><video src="${settings.background.url}" autoplay muted loop playsinline></video></div>`;
  }
  return `<div class="xb-bg-fixed"><img src="${settings.background.url}" alt=""/></div>`;
}

const TABS: { key: LayoutOptions["active"]; href: string; label: string; icon: string }[] = [
  { key: "home", href: "/", label: "首页", icon: "🏠" },
  { key: "posts", href: "/posts", label: "文章", icon: "📝" },
  { key: "friends", href: "/friends", label: "友链", icon: "🔗" },
  { key: "about", href: "/about", label: "关于", icon: "👤" },
];

function tabsHtml(active?: string) {
  return TABS.map(
    (t) => `<a class="xb-tab ${t.key === active ? "active" : ""}" href="${t.href}"><span>${t.icon}</span><span>${t.label}</span></a>`
  ).join("");
}

function userAreaHtml(user?: UserSessionData | null) {
  if (user) {
    return `<div class="xb-user">
      <a class="xb-avatar-btn" href="/logout" title="点击退出登录">
        <img src="${user.avatar_url}" alt="${user.login}"/>
        <span>${user.login}</span>
      </a>
    </div>`;
  }
  return `<a class="xb-login-btn" href="/login">🔑 登录</a>`;
}

export function layout(opts: LayoutOptions, content: string): string {
  const { title, settings, active, user, bodyClass } = opts;
  const accentRgb = hexToRgb(settings.accentColor || "#5b8def");
  const verticalClass = settings.verticalTabs ? "vertical" : "";
  const brand = `<a class="xb-brand" href="/">${
    settings.avatar ? `<img src="${settings.avatar}" alt="avatar"/>` : "🪟"
  }<b>${settings.siteTitle}</b></a>`;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${title ? `${title} - ${settings.siteTitle}` : settings.siteTitle}</title>
<meta name="description" content="${settings.siteSubtitle}" />
${settings.favicon ? `<link rel="icon" href="${settings.favicon}" />` : ""}
<link rel="stylesheet" href="/assets/style.css" />
${opts.head || ""}
<style>:root{ --xb-accent:${settings.accentColor || "#5b8def"}; --xb-accent-rgb:${accentRgb}; --xb-blur:${settings.glassBlur ?? 18}px; --xb-overlay:${settings.background?.overlayOpacity ?? 0.35}; }</style>
</head>
<body class="${bodyClass || ""}">
${renderBackground(settings)}
<div class="xb-bg-overlay" style="opacity:${settings.background?.overlayOpacity ?? 0.35}"></div>
<div class="xb-shell ${verticalClass}">
${settings.verticalTabs ? `<button class="xb-mobile-toggle xb-btn secondary" aria-label="菜单">☰</button>` : ""}
  <header class="xb-header xb-glass">
    ${brand}
    <nav class="xb-tabs">${tabsHtml(active)}</nav>
    <div class="xb-spacer"></div>
    <form class="xb-search xb-glass" action="/search" method="get" onsubmit="return false;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input id="xb-search-input" name="q" placeholder="搜索文章..." autocomplete="off"/>
    </form>
    ${userAreaHtml(user)}
  </header>

  <aside class="xb-sidebar xb-glass">
    ${brand}
    <nav class="xb-tabs">${tabsHtml(active)}</nav>
    <div class="xb-spacer"></div>
    <form class="xb-search xb-glass" action="/search" method="get" onsubmit="return false;" style="width:100%">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input id="xb-search-input" name="q" placeholder="搜索文章..." autocomplete="off"/>
    </form>
    ${userAreaHtml(user)}
  </aside>

  <main class="xb-main xb-fade-in">
    ${content}
  </main>
</div>
<footer class="xb-footer">
  ${settings.footerText || ""} ${settings.icp ? `· ${settings.icp}` : ""}
  <div style="margin-top:6px;opacity:.7">Powered by <a href="https://github.com/" target="_blank" style="color:inherit">Xblog</a></div>
</footer>
<script src="/assets/app.js"></script>
</body>
</html>`;
}

export function errorPage(status: number, message: string, settings?: Settings): string {
  const s = settings || {
    siteTitle: "Xblog",
    siteSubtitle: "",
    favicon: "",
    avatar: "",
    background: { type: "none", url: "", overlayOpacity: 0.35 },
    verticalTabs: false,
    glassBlur: 18,
    accentColor: "#5b8def",
    notice: "",
    pinnedSlugs: [],
    footerText: "",
    socialLinks: [],
  } as Settings;
  return layout(
    { title: `出错了 (${status})`, settings: s, active: "" },
    `<div class="xb-card xb-glass" style="text-align:center;padding:60px 20px;">
      <div style="font-size:52px;margin-bottom:16px;">${status === 404 ? "🧭" : "🛠️"}</div>
      <h2 style="margin:0 0 10px;">${status === 404 ? "页面走丢了" : "出了点小问题"}</h2>
      <p style="opacity:.7;">${message}</p>
      <a class="xb-btn" href="/" style="margin-top:16px;display:inline-flex;">返回首页</a>
    </div>`
  );
}
