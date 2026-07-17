import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Env } from "../types";
import { getSettings, saveSettings, verifyAdminPassword, changeAdminPassword, getLockedFields, type LockedFields } from "../lib/settings";
import { createAdminSession, verifyAdminSession } from "../lib/auth";
import {
  listPosts,
  getPost,
  savePost,
  deletePost,
  getFriends,
  saveFriends,
  getAbout,
  saveAbout,
  uploadAsset,
} from "../lib/data";
import { renderMarkdown } from "../lib/markdown";
import { layout, errorPage } from "../lib/layout";

export const adminRoutes = new Hono<{ Bindings: Env }>();

function escapeAttr(s: string): string {
  return (s || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// 友链头像字段：URL 输入 + 本地文件上传（复用 xbBindUploadInput，自带进度条）
function friendAvatarField(idPrefix: string, avatarUrl?: string) {
  return `
    <div class="xb-field">
      <label>头像 URL</label>
      <input class="xb-input" id="${idPrefix}-avatar-input" name="avatar" value="${escapeAttr(avatarUrl || "")}" placeholder="/files/... 或外部链接"/>
      <input type="file" id="${idPrefix}-file-avatar" accept="image/*" style="margin-top:8px;"/>
      <img id="${idPrefix}-avatar-preview" class="xb-avatar-preview-sm" src="${escapeAttr(avatarUrl || "")}" style="display:${avatarUrl ? "block" : "none"};"/>
    </div>
    <script>
    document.addEventListener('DOMContentLoaded', function(){
      if (window.xbBindUploadInput) {
        window.xbBindUploadInput(document.getElementById('${idPrefix}-file-avatar'), function(url){
          document.getElementById('${idPrefix}-avatar-input').value = url;
          var img = document.getElementById('${idPrefix}-avatar-preview');
          if (img) { img.src = url; img.style.display = 'block'; }
        });
      }
    });
    </script>
  `;
}

function escapeForTextarea(s: string): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function isAuthed(c: any): Promise<boolean> {
  const cookie = getCookie(c, "xb_admin");
  return verifyAdminSession(c.env, cookie);
}

function adminShell(title: string, active: string, inner: string) {
  const nav = [
    ["dashboard", "/admin", "🏠 总览"],
    ["posts", "/admin/posts", "📝 文章管理"],
    ["friends", "/admin/friends", "🔗 友链管理"],
    ["about", "/admin/about", "👤 关于页"],
    ["settings", "/admin/settings", "⚙️ 网站设置"],
    ["password", "/admin/password", "🔒 修改密码"],
  ];
  return `
    <div class="xb-admin-nav">
      ${nav.map(([key, href, label]) => `<a class="xb-chip ${active === key ? "active" : ""}" href="${href}">${label}</a>`).join("")}
      <div class="xb-spacer"></div>
      <a class="xb-chip" href="/" target="_blank">🌐 查看网站</a>
      <a class="xb-chip" href="/admin/logout">🚪 退出登录</a>
    </div>
    <div class="xb-card xb-glass" style="padding:26px;">
      <h2 style="margin-top:0;">${title}</h2>
      ${inner}
    </div>
  `;
}

// 中间件：除登录相关路由外，都需要校验管理员会话
adminRoutes.use("*", async (c, next) => {
  const path = c.req.path;
  if (path === "/admin" && c.req.method === "GET") {
    // 首页自身负责渲染登录表单或跳转
  }
  await next();
});

async function requireAuth(c: any): Promise<Response | null> {
  const authed = await isAuthed(c);
  if (!authed) return c.redirect("/admin");
  return null;
}

// ---------------- 登录 / 总览 ----------------
adminRoutes.get("/admin", async (c) => {
  const settings = await getSettings(c.env);
  const authed = await isAuthed(c);
  if (!authed) {
    return c.html(
      layout(
        { title: "管理员登录", settings, active: "" },
        `<div class="xb-card xb-glass" style="max-width:380px;margin:60px auto;padding:32px;">
          <h2 style="text-align:center;margin-top:0;">🔐 Xblog 管理后台</h2>
          <form method="post" action="/admin/login">
            <div class="xb-field"><label>管理员密码</label><input class="xb-input" type="password" name="password" placeholder="初始密码为 admin" required/></div>
            <button class="xb-btn" style="width:100%;justify-content:center;" type="submit">登录</button>
          </form>
        </div>`
      )
    );
  }
  const { items, total } = await listPosts(c.env, { pageSize: 5 });
  const friends = await getFriends(c.env);
  const inner = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;margin-bottom:20px;">
      <div class="xb-card xb-glass" style="text-align:center;"><div style="font-size:26px;">${total}</div><div style="opacity:.6;font-size:13px;">篇文章</div></div>
      <div class="xb-card xb-glass" style="text-align:center;"><div style="font-size:26px;">${friends.length}</div><div style="opacity:.6;font-size:13px;">位友链</div></div>
      <div class="xb-card xb-glass" style="text-align:center;"><div style="font-size:26px;">${settings.pinnedSlugs.length}</div><div style="opacity:.6;font-size:13px;">篇置顶</div></div>
    </div>
    <h3>最近文章</h3>
    <table class="xb-table-list"><thead><tr><th>标题</th><th>分类</th><th>更新时间</th></tr></thead><tbody>
    ${items.map((p) => `<tr><td><a href="/admin/posts/${p.slug}/edit">${p.title}</a></td><td>${p.category}</td><td>${p.updatedAt?.slice(0, 10)}</td></tr>`).join("") || '<tr><td colspan="3">暂无文章，快去发布第一篇吧！</td></tr>'}
    </tbody></table>
    <div style="margin-top:18px;"><a class="xb-btn" href="/admin/posts/new">✍️ 新建文章</a></div>
  `;
  return c.html(layout({ title: "管理后台", settings, active: "" }, adminShell("总览", "dashboard", inner)));
});

adminRoutes.post("/admin/login", async (c) => {
  const settings = await getSettings(c.env);
  const body = await c.req.parseBody();
  const password = (body.password as string) || "";
  const ok = await verifyAdminPassword(c.env, password);
  if (!ok) {
    return c.html(
      layout(
        { title: "管理员登录", settings, active: "" },
        `<div class="xb-card xb-glass" style="max-width:380px;margin:60px auto;padding:32px;">
          <h2 style="text-align:center;margin-top:0;">🔐 Xblog 管理后台</h2>
          <p style="color:#e5484d;text-align:center;">密码错误，请重试</p>
          <form method="post" action="/admin/login">
            <div class="xb-field"><label>管理员密码</label><input class="xb-input" type="password" name="password" required/></div>
            <button class="xb-btn" style="width:100%;justify-content:center;" type="submit">登录</button>
          </form>
        </div>`
      )
    );
  }
  const token = await createAdminSession(c.env);
  const isHttps = new URL(c.req.url).protocol === "https:";
  setCookie(c, "xb_admin", token, { httpOnly: true, path: "/", maxAge: 7 * 24 * 3600, sameSite: "Lax", secure: isHttps });
  return c.redirect("/admin");
});

adminRoutes.get("/admin/logout", async (c) => {
  deleteCookie(c, "xb_admin", { path: "/" });
  return c.redirect("/admin");
});

// ---------------- 网站设置 ----------------
adminRoutes.get("/admin/settings", async (c) => {
  const guard = await requireAuth(c);
  if (guard) return guard;
  const settings = await getSettings(c.env);
  const locked = getLockedFields(c.env);
  const lockNote = (key: keyof LockedFields) =>
    locked[key] ? `<div class="xb-lock-note">🔒 该项由环境变量设置，优先级最高，后台修改不会生效</div>` : "";

  const inner = `
    <form method="post" action="/admin/settings">
      <div class="xb-field"><label>网站标题</label><input class="xb-input" name="siteTitle" value="${settings.siteTitle}" ${locked.siteTitle ? "disabled" : ""}/>${lockNote("siteTitle")}</div>
      <div class="xb-field"><label>副标题 / 简介</label><input class="xb-input" name="siteSubtitle" value="${settings.siteSubtitle}" ${locked.siteSubtitle ? "disabled" : ""}/></div>
      <div class="xb-field"><label>网站图标 URL（favicon）</label>
        <input class="xb-input" id="xb-favicon-input" name="favicon" value="${settings.favicon}" placeholder="/files/... 或外部链接" ${locked.favicon ? "disabled" : ""}/>${lockNote("favicon")}
        ${locked.favicon ? "" : `<input type="file" id="xb-file-favicon" accept="image/x-icon,image/png,image/svg+xml,image/*" style="margin-top:8px;"/>`}
      </div>
      <div class="xb-field"><label>个人头像 URL（显示于左上角）</label>
        <input class="xb-input" id="xb-avatar-input" name="avatar" value="${settings.avatar}" ${locked.avatar ? "disabled" : ""}/>${lockNote("avatar")}
        ${locked.avatar ? "" : `<input type="file" id="xb-file-avatar" accept="image/*" style="margin-top:8px;"/>
        <img id="xb-avatar-preview" class="xb-avatar-preview-sm" src="${settings.avatar}" style="display:${settings.avatar ? "block" : "none"};"/>`}
      </div>
      <div class="xb-field"><label>背景类型</label>
        <select class="xb-input" id="xb-background-type" name="backgroundType" ${locked.background ? "disabled" : ""}>
          <option value="none" ${settings.background.type === "none" ? "selected" : ""}>无背景</option>
          <option value="image" ${settings.background.type === "image" ? "selected" : ""}>图片</option>
          <option value="video" ${settings.background.type === "video" ? "selected" : ""}>视频</option>
        </select>
      </div>
      <div class="xb-field"><label>背景地址（图片/视频 URL）</label>
        <input class="xb-input" id="xb-background-input" name="backgroundUrl" value="${settings.background.url}" ${locked.background ? "disabled" : ""}/>${lockNote("background")}
        ${locked.background ? "" : `<input type="file" id="xb-file-background" accept="image/*,video/*" style="margin-top:8px;"/>`}
      </div>
      <div class="xb-field"><label>背景蒙层不透明度（0~1）</label>
        <div class="xb-range-field">
          <input type="range" id="xb-opacity-input" name="overlayOpacity" step="0.05" min="0" max="1" value="${settings.background.overlayOpacity}"/>
          <span class="xb-range-value" id="xb-opacity-value">${settings.background.overlayOpacity}</span>
        </div>
      </div>
      <div class="xb-field"><label>玻璃模糊强度（px）</label><input class="xb-input" type="number" name="glassBlur" value="${settings.glassBlur}"/></div>
      <div class="xb-field"><label>主题强调色</label><input class="xb-input" type="color" name="accentColor" value="${settings.accentColor}" style="height:44px;" ${locked.accentColor ? "disabled" : ""}/>${lockNote("accentColor")}</div>
      <div class="xb-field"><label>是否启用垂直标签页（侧边栏导航）</label>
        <select class="xb-input" name="verticalTabs" ${locked.verticalTabs ? "disabled" : ""}>
          <option value="false" ${!settings.verticalTabs ? "selected" : ""}>关闭（顶部横向标签）</option>
          <option value="true" ${settings.verticalTabs ? "selected" : ""}>开启（侧边垂直标签）</option>
        </select>
        ${lockNote("verticalTabs")}
      </div>
      <div class="xb-field"><label>首页公告</label><textarea class="xb-textarea" name="notice" rows="3">${escapeForTextarea(settings.notice)}</textarea></div>
      <div class="xb-field"><label>置顶文章 slug（多个用英文逗号分隔）</label><input class="xb-input" name="pinnedSlugs" value="${settings.pinnedSlugs.join(",")}"/></div>
      <div class="xb-field"><label>页脚文字</label><input class="xb-input" name="footerText" value="${settings.footerText || ""}"/></div>
      <div class="xb-field"><label>备案号（ICP，可留空）</label><input class="xb-input" name="icp" value="${settings.icp || ""}"/></div>
      <button class="xb-btn" type="submit">💾 保存设置</button>
    </form>
    <script>
    document.addEventListener('DOMContentLoaded', function(){
      if (window.xbBindUploadInput) {
        window.xbBindUploadInput(document.getElementById('xb-file-favicon'), function(url){
          document.getElementById('xb-favicon-input').value = url;
        });
        window.xbBindUploadInput(document.getElementById('xb-file-avatar'), function(url){
          document.getElementById('xb-avatar-input').value = url;
          var img = document.getElementById('xb-avatar-preview');
          if (img) { img.src = url; img.style.display = 'block'; }
        });
        window.xbBindUploadInput(document.getElementById('xb-file-background'), function(url, f){
          document.getElementById('xb-background-input').value = url;
          var sel = document.getElementById('xb-background-type');
          if (sel) sel.value = (f.type || '').indexOf('video') === 0 ? 'video' : 'image';
        });
      }
      var opacityInput = document.getElementById('xb-opacity-input');
      var opacityValue = document.getElementById('xb-opacity-value');
      if (opacityInput && opacityValue) {
        opacityInput.addEventListener('input', function(){ opacityValue.textContent = opacityInput.value; });
      }
    });
    </script>
  `;
  return c.html(layout({ title: "网站设置", settings, active: "" }, adminShell("网站设置", "settings", inner)));
});

adminRoutes.post("/admin/settings", async (c) => {
  const guard = await requireAuth(c);
  if (guard) return guard;
  const body = await c.req.parseBody();
  const patch: any = {
    siteTitle: body.siteTitle,
    siteSubtitle: body.siteSubtitle,
    favicon: body.favicon,
    avatar: body.avatar,
    notice: body.notice,
    footerText: body.footerText,
    icp: body.icp,
    accentColor: body.accentColor,
    glassBlur: parseInt((body.glassBlur as string) || "18", 10),
    verticalTabs: body.verticalTabs === "true",
    pinnedSlugs: ((body.pinnedSlugs as string) || "").split(",").map((s) => s.trim()).filter(Boolean),
    background: {
      type: body.backgroundType,
      url: body.backgroundUrl,
      overlayOpacity: parseFloat((body.overlayOpacity as string) || "0.35"),
    },
  };

  // 头像 / 背景 / favicon 现在都是前端先上传到 GitHub 拿到 URL 后再随表单一起提交
  // 文本字段（见 /assets/app.js 里的 xbBindUploadInput），Worker 这一侧不用再处理
  // 二进制文件、不用再做耗 CPU 的 base64 编码——这也是修复大文件上传时
  // Cloudflare "Error 1102" 的关键。

  await saveSettings(c.env, patch);
  return c.redirect("/admin/settings");
});

// ---------------- 修改密码 ----------------
adminRoutes.get("/admin/password", async (c) => {
  const guard = await requireAuth(c);
  if (guard) return guard;
  const settings = await getSettings(c.env);
  const locked = !!c.env.ADMIN_PASSWORD;
  const inner = locked
    ? `<div class="xb-empty">当前管理员密码由环境变量 <code>ADMIN_PASSWORD</code> 控制，优先级最高，无法在后台修改。</div>`
    : `<form method="post" action="/admin/password">
        <div class="xb-field"><label>新密码</label><input class="xb-input" type="password" name="password" minlength="4" required/></div>
        <button class="xb-btn" type="submit">🔒 更新密码</button>
      </form>`;
  return c.html(layout({ title: "修改密码", settings, active: "" }, adminShell("修改密码", "password", inner)));
});

adminRoutes.post("/admin/password", async (c) => {
  const guard = await requireAuth(c);
  if (guard) return guard;
  const body = await c.req.parseBody();
  const ok = await changeAdminPassword(c.env, (body.password as string) || "");
  const settings = await getSettings(c.env);
  const msg = ok ? "密码修改成功！" : "密码修改失败：当前由环境变量控制。";
  return c.html(layout({ title: "修改密码", settings, active: "" }, adminShell("修改密码", "password", `<p>${msg}</p><a class="xb-btn secondary" href="/admin/password">返回</a>`)));
});

// ---------------- 文章管理 ----------------
adminRoutes.get("/admin/posts", async (c) => {
  const guard = await requireAuth(c);
  if (guard) return guard;
  const settings = await getSettings(c.env);
  const { items } = await listPosts(c.env, { pageSize: 1000 });
  const rows = items
    .map(
      (p) => `<tr>
      <td>${p.title}</td><td>${p.category}</td><td>${p.views}</td><td>${p.updatedAt?.slice(0, 10)}</td>
      <td style="white-space:nowrap;">
        <a class="xb-chip" href="/admin/posts/${p.slug}/edit">编辑</a>
        <a class="xb-chip" href="/posts/${p.slug}" target="_blank">预览</a>
        <form style="display:inline" method="post" action="/admin/posts/${p.slug}/delete" onsubmit="return confirm('确定删除该文章？')"><button class="xb-chip" style="border:none;cursor:pointer;color:#e5484d;">删除</button></form>
      </td>
    </tr>`
    )
    .join("");
  const inner = `
    <div style="margin-bottom:16px;"><a class="xb-btn" href="/admin/posts/new">✍️ 新建文章</a></div>
    <table class="xb-table-list"><thead><tr><th>标题</th><th>分类</th><th>浏览</th><th>更新</th><th>操作</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="5">暂无文章</td></tr>'}</tbody></table>
  `;
  return c.html(layout({ title: "文章管理", settings, active: "" }, adminShell("文章管理", "posts", inner)));
});

function editorForm(post: { slug?: string; title?: string; content?: string; category?: string; tags?: string[]; cover?: string; pinned?: boolean } = {}) {
  return `
  <form method="post" action="${post.slug ? `/admin/posts/${post.slug}` : "/admin/posts"}">
    <div class="xb-field"><label>标题</label><input class="xb-input" name="title" value="${post.title || ""}" required/></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
      <div class="xb-field"><label>分类</label><input class="xb-input" name="category" value="${post.category || "未分类"}"/></div>
      <div class="xb-field"><label>标签（英文逗号分隔）</label><input class="xb-input" name="tags" value="${(post.tags || []).join(",")}"/></div>
    </div>
    <div class="xb-field">
      <label>封面图</label>
      <input type="hidden" id="xb-cover-url" name="cover" value="${post.cover || ""}"/>
      <input type="file" id="xb-file-cover" accept="image/*"/>
      <img id="xb-cover-preview" src="${post.cover || ""}" style="display:${post.cover ? "block" : "none"};max-width:220px;border-radius:10px;margin-top:8px;"/>
    </div>
    <div class="xb-field"><label><input type="checkbox" name="pinned" value="1" ${post.pinned ? "checked" : ""}/> 置顶到首页</label></div>

    <div class="xb-editor-toolbar">
      <button type="button" data-md="bold"><b>B</b> 加粗</button>
      <button type="button" data-md="italic"><i>I</i> 斜体</button>
      <button type="button" data-md="strike">删除线</button>
      <button type="button" data-md="code">代码</button>
      <button type="button" data-md="h2">H2</button>
      <button type="button" data-md="h3">H3</button>
      <button type="button" data-md="quote">引用</button>
      <button type="button" data-md="ul">无序列表</button>
      <button type="button" data-md="ol">有序列表</button>
      <button type="button" data-md="table">表格</button>
      <button type="button" data-md="link">链接</button>
      <button type="button" data-md="hr">分割线</button>
      <button type="button" data-md="image">🖼️ 图片</button>
      <button type="button" data-md="audio">🎵 音频</button>
      <button type="button" data-md="bilibili">📺 B站视频</button>
      <button type="button" data-md="youtube">▶️ YouTube</button>
      <input type="file" id="xb-file-image" accept="image/*" style="display:none"/>
      <input type="file" id="xb-file-audio" accept="audio/*" style="display:none"/>
    </div>
    <div class="xb-upload-progress" id="xb-editor-upload-progress"><div class="xb-upload-progress-track"><div class="xb-upload-progress-bar"></div></div><span class="xb-upload-progress-text"></span></div>
    <div class="xb-editor-wrap">
      <textarea class="xb-textarea" id="xb-md-input" name="content" placeholder="像写 Word 一样开始创作吧，支持拖拽图片上传...">${escapeForTextarea(post.content || "")}</textarea>
      <div class="xb-glass" id="xb-md-preview"></div>
    </div>
    <div style="margin-top:18px;"><button class="xb-btn" type="submit">💾 保存发布</button></div>
    <script src="/assets/editor.js"></script>
  </form>`;
}

adminRoutes.get("/admin/posts/new", async (c) => {
  const guard = await requireAuth(c);
  if (guard) return guard;
  const settings = await getSettings(c.env);
  return c.html(layout({ title: "新建文章", settings, active: "" }, adminShell("新建文章", "posts", editorForm())));
});

adminRoutes.get("/admin/posts/:slug/edit", async (c) => {
  const guard = await requireAuth(c);
  if (guard) return guard;
  const settings = await getSettings(c.env);
  const post = await getPost(c.env, c.req.param("slug"));
  if (!post) return c.html(errorPage(404, "文章不存在", settings), 404);
  return c.html(layout({ title: "编辑文章", settings, active: "" }, adminShell("编辑文章", "posts", editorForm(post))));
});

async function handleSavePost(c: any, slug?: string) {
  const body = await c.req.parseBody();
  await savePost(c.env, {
    slug,
    title: (body.title as string) || "无标题",
    content: (body.content as string) || "",
    category: (body.category as string) || "未分类",
    tags: ((body.tags as string) || "").split(",").map((s: string) => s.trim()).filter(Boolean),
    cover: (body.cover as string) || "",
    pinned: body.pinned === "1",
  });
  return c.redirect("/admin/posts");
}
adminRoutes.post("/admin/posts", async (c) => {
  const guard = await requireAuth(c);
  if (guard) return guard;
  return handleSavePost(c);
});
adminRoutes.post("/admin/posts/:slug", async (c) => {
  const guard = await requireAuth(c);
  if (guard) return guard;
  return handleSavePost(c, c.req.param("slug"));
});
adminRoutes.post("/admin/posts/:slug/delete", async (c) => {
  const guard = await requireAuth(c);
  if (guard) return guard;
  await deletePost(c.env, c.req.param("slug"));
  return c.redirect("/admin/posts");
});

// ---------------- Markdown 实时预览接口 ----------------
adminRoutes.post("/admin/preview", async (c) => {
  const guard = await requireAuth(c);
  if (guard) return guard;
  const body = await c.req.json().catch(() => ({ md: "" }));
  return c.html(`<div class="xb-body">${renderMarkdown(body.md || "")}</div>`);
});

// 上传文件大小上限。免费版 Cloudflare Workers 的 CPU 时间预算非常小（10ms 级别），
// 文件越大、编码转发所需的 CPU 时间越多，越容易触发 "Error 1102: Worker exceeded
// resource limits"。这里给一个默认的保守上限；如果你已经把 Worker 升级到了
// Cloudflare 的付费方案（CPU 时间预算会大幅提升到 30s 级别），可以适当调大这个数值，
// 但建议不要超过 25MB —— 这是 GitHub Contents API 实际能稳定处理的单文件大小。
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15MB

// 把 ArrayBuffer 分块转成 base64，避免用 String.fromCharCode(...bytes) 展开整个大数组
// 导致函数参数过多而栈溢出，同时把单次字符串拼接的规模控制在可控范围内。
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000; // 32KB
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    let chunkStr = "";
    const chunk = bytes.subarray(i, i + chunkSize);
    for (let j = 0; j < chunk.length; j++) chunkStr += String.fromCharCode(chunk[j]);
    parts.push(chunkStr);
  }
  return btoa(parts.join(""));
}

// ---------------- 通用文件上传 ----------------
// 前端直接把文件的原始二进制作为请求体发送（不再包一层 JSON + base64），
// 文件名通过自定义请求头传递。这样 Worker 侧不用再解析一个巨大的 JSON 字符串，
// 显著降低 CPU 占用；配合上面的大小上限，是修复大文件上传触发 1102 的关键。
adminRoutes.post("/admin/upload", async (c) => {
  const guard = await requireAuth(c);
  if (guard) return guard;

  const lenHeader = c.req.header("content-length");
  if (lenHeader && parseInt(lenHeader, 10) > MAX_UPLOAD_BYTES) {
    return c.json({ error: `文件过大，最大支持 ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB` }, 413);
  }
  const filenameHeader = c.req.header("x-xb-filename") || "";
  let filename = "";
  try {
    filename = decodeURIComponent(filenameHeader);
  } catch {
    filename = filenameHeader;
  }
  if (!filename) return c.json({ error: "缺少文件名（X-Xb-Filename 请求头）" }, 400);

  try {
    const buf = await c.req.arrayBuffer();
    if (buf.byteLength > MAX_UPLOAD_BYTES) {
      return c.json({ error: `文件过大，最大支持 ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB` }, 413);
    }
    const base64 = arrayBufferToBase64(buf);
    const { url } = await uploadAsset(c.env, filename, base64);
    return c.json({ url });
  } catch (e) {
    console.error(e);
    return c.json({ error: "上传失败" }, 500);
  }
});

// ---------------- 友链管理 ----------------
adminRoutes.get("/admin/friends", async (c) => {
  const guard = await requireAuth(c);
  if (guard) return guard;
  const settings = await getSettings(c.env);
  const friends = await getFriends(c.env);
  const rows = friends
    .map(
      (f, i) => `<tr><td><img src="${f.avatar}" style="width:32px;height:32px;border-radius:50%;"/></td><td>${f.name}</td><td>${f.url}</td><td>${f.desc}</td>
      <td style="white-space:nowrap;">
        <a class="xb-chip" href="/admin/friends/${i}/edit">编辑</a>
        <form method="post" action="/admin/friends/delete" style="display:inline" onsubmit="return confirm('确定删除该友链？')"><input type="hidden" name="index" value="${i}"/><button class="xb-chip" style="border:none;cursor:pointer;color:#e5484d;">删除</button></form>
      </td></tr>`
    )
    .join("");
  const inner = `
    <table class="xb-table-list"><thead><tr><th>头像</th><th>名称</th><th>链接</th><th>描述</th><th></th></tr></thead>
    <tbody>${rows || '<tr><td colspan="5">暂无友链</td></tr>'}</tbody></table>
    <h3 style="margin-top:26px;">添加友链</h3>
    <form method="post" action="/admin/friends">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
        <div class="xb-field"><label>名称</label><input class="xb-input" name="name" required/></div>
        <div class="xb-field"><label>链接</label><input class="xb-input" name="url" required/></div>
      </div>
      ${friendAvatarField("xb-add")}
      <div class="xb-field"><label>描述</label><input class="xb-input" name="desc"/></div>
      <button class="xb-btn" type="submit">➕ 添加</button>
    </form>
  `;
  return c.html(layout({ title: "友链管理", settings, active: "" }, adminShell("友链管理", "friends", inner)));
});

adminRoutes.get("/admin/friends/:index/edit", async (c) => {
  const guard = await requireAuth(c);
  if (guard) return guard;
  const settings = await getSettings(c.env);
  const idx = parseInt(c.req.param("index"), 10);
  const friends = await getFriends(c.env);
  const f = friends[idx];
  if (!f) return c.html(errorPage(404, "友链不存在", settings), 404);
  const inner = `
    <form method="post" action="/admin/friends/${idx}">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
        <div class="xb-field"><label>名称</label><input class="xb-input" name="name" value="${escapeAttr(f.name)}" required/></div>
        <div class="xb-field"><label>链接</label><input class="xb-input" name="url" value="${escapeAttr(f.url)}" required/></div>
      </div>
      ${friendAvatarField("xb-edit", f.avatar)}
      <div class="xb-field"><label>描述</label><input class="xb-input" name="desc" value="${escapeAttr(f.desc || "")}"/></div>
      <button class="xb-btn" type="submit">💾 保存</button>
      <a class="xb-btn secondary" href="/admin/friends" style="margin-left:8px;">取消</a>
    </form>
  `;
  return c.html(layout({ title: "编辑友链", settings, active: "" }, adminShell("编辑友链", "friends", inner)));
});

adminRoutes.post("/admin/friends", async (c) => {
  const guard = await requireAuth(c);
  if (guard) return guard;
  const body = await c.req.parseBody();
  const friends = await getFriends(c.env);
  friends.push({
    name: (body.name as string) || "",
    url: (body.url as string) || "",
    avatar: (body.avatar as string) || "",
    desc: (body.desc as string) || "",
  });
  await saveFriends(c.env, friends);
  return c.redirect("/admin/friends");
});

adminRoutes.post("/admin/friends/:index", async (c) => {
  const guard = await requireAuth(c);
  if (guard) return guard;
  const idx = parseInt(c.req.param("index"), 10);
  const body = await c.req.parseBody();
  const friends = await getFriends(c.env);
  if (idx >= 0 && idx < friends.length) {
    friends[idx] = {
      name: (body.name as string) || friends[idx].name,
      url: (body.url as string) || friends[idx].url,
      avatar: (body.avatar as string) || "",
      desc: (body.desc as string) || "",
    };
    await saveFriends(c.env, friends);
  }
  return c.redirect("/admin/friends");
});

adminRoutes.post("/admin/friends/delete", async (c) => {
  const guard = await requireAuth(c);
  if (guard) return guard;
  const body = await c.req.parseBody();
  const idx = parseInt((body.index as string) || "-1", 10);
  const friends = await getFriends(c.env);
  if (idx >= 0 && idx < friends.length) friends.splice(idx, 1);
  await saveFriends(c.env, friends);
  return c.redirect("/admin/friends");
});

// ---------------- 关于页管理 ----------------
adminRoutes.get("/admin/about", async (c) => {
  const guard = await requireAuth(c);
  if (guard) return guard;
  const settings = await getSettings(c.env);
  const about = await getAbout(c.env);
  const inner = `
    <form method="post" action="/admin/about">
      <div class="xb-field"><label>关于内容（支持 Markdown）</label><textarea class="xb-textarea" name="content" rows="16">${escapeForTextarea(about.content)}</textarea></div>
      <button class="xb-btn" type="submit">💾 保存</button>
    </form>
  `;
  return c.html(layout({ title: "关于页", settings, active: "" }, adminShell("关于页管理", "about", inner)));
});

adminRoutes.post("/admin/about", async (c) => {
  const guard = await requireAuth(c);
  if (guard) return guard;
  const body = await c.req.parseBody();
  await saveAbout(c.env, (body.content as string) || "");
  return c.redirect("/admin/about");
});
