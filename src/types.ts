// Xblog - Cloudflare Workers (Hono) 类型定义

export interface Env {
  // KV 命名空间：存放网站设置 / 计数器 / 会话辅助数据
  SETTINGS_KV: KVNamespace;

  // ---- GitHub 存储仓库（用于保存文章 / 友链 / 关于 / 图片视频等资源） ----
  GITHUB_TOKEN: string; // 具有 repo 权限的 Personal Access Token
  GITHUB_OWNER: string; // 仓库拥有者
  GITHUB_REPO: string; // 仓库名
  GITHUB_BRANCH?: string; // 分支，默认 main

  // ---- GitHub OAuth App（用于访客登录评论/点赞） ----
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;

  // ---- 用于 Issues 评论功能的仓库（可与存储仓库相同，也可单独配置） ----
  GITHUB_COMMENT_OWNER?: string;
  GITHUB_COMMENT_REPO?: string;

  // ---- 环境变量覆盖项（优先级最高，若设置则管理面板中对应项不可修改） ----
  ADMIN_PASSWORD?: string;
  SESSION_SECRET?: string;
  SITE_TITLE?: string;
  SITE_SUBTITLE?: string;
  SITE_URL?: string; // 站点完整外链地址，用于 OAuth 回调 & RSS 等
  SITE_FAVICON?: string;
  SITE_AVATAR?: string;
  SITE_BACKGROUND_URL?: string;
  SITE_BACKGROUND_TYPE?: string; // image | video | none
  SITE_VERTICAL_TABS?: string; // "true" | "false"
  SITE_ACCENT_COLOR?: string;
}

export interface SocialLink {
  label: string;
  url: string;
  icon?: string;
}

export interface Settings {
  siteTitle: string;
  siteSubtitle: string;
  favicon: string;
  avatar: string;
  background: {
    type: "image" | "video" | "none";
    url: string;
    overlayOpacity: number;
  };
  verticalTabs: boolean;
  glassBlur: number; // 玻璃模糊强度 px
  accentColor: string;
  notice: string; // 首页公告 (支持简单 HTML/Markdown 文本)
  pinnedSlugs: string[]; // 首页置顶文章
  adminPasswordHash?: string; // 管理员密码 (sha256) - 若环境变量存在则忽略
  icp?: string;
  footerText?: string;
  socialLinks: SocialLink[];
}

export interface PostMeta {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  tags: string[];
  cover?: string;
  createdAt: string;
  updatedAt: string;
  pinned?: boolean;
  issueNumber?: number;
}

export interface Post extends PostMeta {
  content: string;
}

export interface Friend {
  name: string;
  url: string;
  avatar: string;
  desc: string;
}

export interface AboutPage {
  content: string;
  updatedAt: string;
}

export interface GithubUser {
  login: string;
  avatar_url: string;
  html_url: string;
}
