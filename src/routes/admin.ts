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
    <form method="post" action="/admin/settings" enctype="multipart/form-data">
      <div class="xb-field"><label>网站标题</label><input class="xb-input" name="siteTitle" value="${settings.siteTitle}" ${locked.siteTitle ? "disabled" : ""}/>${lockNote("siteTitle")}</div>
      <div class="xb-field"><label>副标题 / 简介</label><input class="xb-input" name="siteSubtitle" value="${settings.siteSubtitle}" ${locked.siteSubtitle ? "disabled" : ""}/></div>
      <div class="xb-field"><label>网站图标 URL（favicon）</label><input class="xb-input" name="favicon" value="${settings.favicon}" placeholder="/files/... 或外部链接" ${locked.favicon ? "disabled" : ""}/>${lockNote("favicon")}</div>
      <div class="xb-field"><label>个人头像 URL（显示于左上角）</label><input class="xb-input" name="avatar" value="${settings.avatar}" ${locked.avatar ? "disabled" : ""}/>${lockNote("avatar")}
        <input type="file" name="avatarFile" accept="image/*" style="margin-top:8px;"/>
      </div>
      <div class="xb-field"><label>背景类型</label>
        <select class="xb-input" name="backgroundType" ${locked.background ? "disabled" : ""}>
          <option value="none" ${settings.background.type === "none" ? "selected" : ""}>无背景</option>
          <option value="image" ${settings.background.type === "image" ? "selected" : ""}>图片</option>
          <option value="video" ${settings.background.type === "video" ? "selected" : ""}>视频</option>
        </select>
      </div>
      <div class="xb-field"><label>背景地址（图片/视频 URL）</label><input class="xb-input" name="backgroundUrl" value="${settings.background.url}" ${locked.background ? "disabled" : ""}/>${lockNote("background")}
        <input type="file" name="backgroundFile" accept="image/*,video/*" style="margin-top:8px;"/>
      </div>
      <div class="xb-field"><label>背景蒙层不透明度（0~1）</label><input class="xb-input" type="number" step="0.05" min="0" max="1" name="overlayOpacity" value="${settings.background.overlayOpacity}"/></div>
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

  // 处理文件上传（头像 / 背景）
  const avatarFile = body.avatarFile as File | undefined;
  if (avatarFile && typeof avatarFile === "object" && "arrayBuffer" in avatarFile && avatarFile.size > 0) {
    const buf = await avatarFile.arrayBuffer();
    const base64 = arrayBufferToBase64(buf);
    const { url } = await uploadAsset(c.env, avatarFile.name, base64);
    patch.avatar = url;
  }
  const bgFile = body.backgroundFile as File | undefined;
  if (bgFile && typeof bgFile === "object" && "arrayBuffer" in bgFile && bgFile.size > 0) {
    const buf = await bgFile.arrayBuffer();
    const base64 = arrayBufferToBase64(buf);
    const { url } = await uploadAsset(c.env, bgFile.name, base64);
    patch.background.url = url;
    patch.background.type = bgFile.type.startsWith("video") ? "video" : "image";
  }

  await saveSettings(c.env, patch);
  return c.redirect("/admin/settings");
});

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

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

// ---------------- 通用文件上传 ----------------
adminRoutes.post("/admin/upload", async (c) => {
  const guard = await requireAuth(c);
  if (guard) return guard;
  try {
    const body = await c.req.json();
    const { filename, data } = body as { filename: string; data: string };
    if (!filename || !data) return c.json({ error: "参数缺失" }, 400);
    const { url } = await uploadAsset(c.env, filename, data);
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
      <td><form method="post" action="/admin/friends/delete" style="display:inline"><input type="hidden" name="index" value="${i}"/><button class="xb-chip" style="border:none;cursor:pointer;color:#e5484d;">删除</button></form></td></tr>`
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
        <div class="xb-field"><label>头像 URL</label><input class="xb-input" name="avatar"/></div>
        <div class="xb-field"><label>描述</label><input class="xb-input" name="desc"/></div>
      </div>
      <button class="xb-btn" type="submit">➕ 添加</button>
    </form>
  `;
  return c.html(layout({ title: "友链管理", settings, active: "" }, adminShell("友链管理", "friends", inner)));
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
