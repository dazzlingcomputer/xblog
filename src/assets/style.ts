// Xblog 前端样式：UWP 风格 + 液态玻璃(Acrylic/Liquid Glass) 效果
// 全部使用 CSS transform/opacity 驱动动画，避免低端设备掉帧；backdrop-filter 使用适中数值。
export const STYLE_CSS = `
:root{
  --xb-accent: #5b8def;
  --xb-blur: 18px;
  --xb-radius: 18px;
  --xb-bg: 246 248 252;
  --xb-fg: 24 27 33;
  --xb-card: 255 255 255;
  --xb-border: 255 255 255;
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark){
  :root{ --xb-bg: 18 20 26; --xb-fg: 235 238 245; --xb-card: 32 35 44; --xb-border: 255 255 255; }
}
*{ box-sizing: border-box; }
html,body{ height:100%; }
body{
  margin:0; font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", -apple-system, BlinkMacSystemFont, sans-serif;
  color: rgb(var(--xb-fg));
  background: rgb(var(--xb-bg));
  min-height:100vh;
  overflow-x:hidden;
}
.xb-bg-fixed{ position:fixed; inset:0; z-index:-2; overflow:hidden; background:linear-gradient(160deg,#4f6ef7 0%,#8f6bff 45%,#ff8bd0 100%);}
.xb-bg-fixed img, .xb-bg-fixed video{ width:100%; height:100%; object-fit:cover; filter:saturate(1.05); }
.xb-bg-overlay{ position:fixed; inset:0; z-index:-1; background:rgb(var(--xb-bg)); opacity:var(--xb-overlay, .35); backdrop-filter: blur(2px); }

.xb-glass{
  background: rgba(var(--xb-card), .55);
  border: 1px solid rgba(var(--xb-border), .35);
  backdrop-filter: blur(var(--xb-blur)) saturate(1.4);
  -webkit-backdrop-filter: blur(var(--xb-blur)) saturate(1.4);
  border-radius: var(--xb-radius);
  box-shadow: 0 8px 32px rgba(0,0,0,.10);
  will-change: transform, opacity;
}
.xb-glass-solid{ background: rgba(var(--xb-card), .85); }

.xb-fade-in{ animation: xbFade .45s cubic-bezier(.2,.8,.2,1) both; }
@keyframes xbFade{ from{ opacity:0; transform: translateY(10px);} to{opacity:1; transform:none;} }
@media (prefers-reduced-motion: reduce){ .xb-fade-in{ animation:none; } }

/* ---------------- 布局 ---------------- */
.xb-shell{ min-height:100vh; display:flex; flex-direction:column; }
.xb-shell.vertical{ flex-direction:row; }

.xb-header{
  position:sticky; top:0; z-index:40; margin:12px; padding:10px 16px;
  display:flex; align-items:center; gap:14px;
}
.vertical .xb-header{ display:none; }

.xb-sidebar{
  width:230px; flex-shrink:0; margin:12px; padding:18px 14px; height:calc(100vh - 24px);
  position:sticky; top:12px; display:none; flex-direction:column; gap:18px;
}
.vertical .xb-sidebar{ display:flex; }

.xb-brand{ display:flex; align-items:center; gap:10px; text-decoration:none; color:inherit; }
.xb-brand img{ width:38px; height:38px; border-radius:50%; object-fit:cover; box-shadow:0 2px 8px rgba(0,0,0,.2); }
.xb-brand b{ font-size:17px; letter-spacing:.5px; }

.xb-tabs{ display:flex; gap:6px; margin-left:6px; }
.vertical .xb-tabs{ flex-direction:column; margin-left:0; margin-top:6px; }
.xb-tab{
  display:flex; align-items:center; gap:8px; padding:9px 16px; border-radius:999px; text-decoration:none;
  color:inherit; opacity:.72; font-size:14.5px; transition: background .25s ease, opacity .25s ease, transform .2s ease;
  white-space:nowrap;
}
.vertical .xb-tab{ border-radius:12px; }
.xb-tab:hover{ background: rgba(var(--xb-fg), .06); transform: translateY(-1px); }
.xb-tab.active{ opacity:1; background: rgba(var(--xb-accent-rgb,91 141 239), .16); color: var(--xb-accent); font-weight:600; }

.xb-spacer{ flex:1; }

.xb-search{
  display:flex; align-items:center; gap:8px; padding:8px 14px; border-radius:999px; width:200px;
  transition: width .25s ease;
}
.xb-search:focus-within{ width:260px; }
.xb-search input{ border:none; outline:none; background:transparent; color:inherit; font-size:14px; width:100%; }
.xb-search svg{ opacity:.6; flex-shrink:0; }

.xb-user{ display:flex; align-items:center; gap:8px; }
.xb-login-btn{
  display:flex; align-items:center; gap:6px; padding:8px 16px; border-radius:999px; text-decoration:none;
  color:#fff; background: var(--xb-accent); font-size:14px; font-weight:600; transition: transform .2s ease, filter .2s ease;
}
.xb-login-btn:hover{ transform: translateY(-1px); filter:brightness(1.08); }
.xb-avatar-btn{ display:flex; align-items:center; gap:8px; text-decoration:none; color:inherit; padding:4px 10px 4px 4px; border-radius:999px; }
.xb-avatar-btn img{ width:30px; height:30px; border-radius:50%; }
.xb-avatar-btn:hover{ background: rgba(var(--xb-fg), .06); }

.xb-main{ flex:1; padding: 6px 16px 60px; max-width:1080px; margin:0 auto; width:100%; }
.vertical .xb-main{ margin: 12px auto; max-width: 900px; }

.xb-mobile-toggle{ display:none; position:fixed; top:14px; right:14px; z-index:70; }
@media (max-width: 760px){
  .xb-tabs{ overflow-x:auto; flex-wrap:nowrap; -webkit-overflow-scrolling:touch; scrollbar-width:none; }
  .xb-tabs::-webkit-scrollbar{ display:none; }
  .vertical .xb-mobile-toggle{ display:flex; }
  .xb-search{ width:130px; }
  .xb-search:focus-within{ width:160px; }
  .xb-sidebar{ position:fixed; left:-260px; top:12px; z-index:60; transition: left .3s cubic-bezier(.2,.8,.2,1); }
  .xb-sidebar.open{ left:12px; }
  .vertical .xb-main{ margin-left:auto; margin-right:auto; }
}

/* ---------------- 卡片 & 组件 ---------------- */
.xb-card{ padding:20px; margin-bottom:16px; transition: transform .25s ease, box-shadow .25s ease; }
.xb-card:hover{ transform: translateY(-3px); box-shadow: 0 14px 38px rgba(0,0,0,.14); }
.xb-notice{ padding:16px 20px; margin-bottom:18px; display:flex; gap:12px; align-items:flex-start; }
.xb-notice b{ color: var(--xb-accent); }
.xb-section-title{ font-size:19px; font-weight:700; margin: 26px 0 14px; display:flex; align-items:center; gap:8px; }
.xb-pill{ display:inline-flex; align-items:center; padding:3px 11px; border-radius:999px; font-size:12.5px; background:rgba(var(--xb-fg),.08); margin-right:6px; }
.xb-pill.pinned{ background: rgba(255,180,60,.22); color:#c9820b; }

.xb-post-item{ display:block; text-decoration:none; color:inherit; padding:16px 18px; margin-bottom:12px; }
.xb-post-item h3{ margin:0 0 6px; font-size:17px; }
.xb-post-item p{ margin:0; opacity:.72; font-size:13.6px; line-height:1.6; }
.xb-meta{ display:flex; gap:12px; margin-top:10px; font-size:12.5px; opacity:.6; flex-wrap:wrap; }

.xb-toolbar{ display:flex; gap:10px; flex-wrap:wrap; margin-bottom:18px; align-items:center; }
.xb-toolbar select, .xb-toolbar a.xb-chip{ padding:7px 14px; border-radius:999px; border:1px solid rgba(var(--xb-fg),.14); background:rgba(var(--xb-card),.5); color:inherit; text-decoration:none; font-size:13.5px; }
.xb-toolbar a.xb-chip.active{ background: var(--xb-accent); color:#fff; border-color:transparent; }

.xb-article{ padding: 28px 30px; }
.xb-article h1{ margin-top:0; font-size:26px; }
.xb-article .xb-body img,.xb-body iframe,.xb-body video{ max-width:100%; border-radius:12px; }
.xb-body{ line-height:1.9; font-size:15.6px; }
.xb-body h1,.xb-body h2,.xb-body h3{ margin-top:1.6em; }
.xb-body pre.xb-pre{ background:rgba(0,0,0,.75); color:#e9e9e9; padding:14px 16px; border-radius:10px; overflow:auto; }
.xb-body code{ background:rgba(var(--xb-fg),.08); padding:2px 6px; border-radius:6px; font-size:.92em; }
.xb-body pre code{ background:none; padding:0; }
.xb-body blockquote.xb-quote{ margin:0; padding:8px 16px; border-left:4px solid var(--xb-accent); background:rgba(var(--xb-accent-rgb,91 141 239),.08); border-radius:0 10px 10px 0; }
.xb-body table.xb-table{ border-collapse:collapse; width:100%; }
.xb-body table.xb-table th,.xb-body table.xb-table td{ border:1px solid rgba(var(--xb-fg),.14); padding:8px 12px; }
.xb-table-wrap{ overflow-x:auto; }
.xb-embed{ position:relative; padding-top:56.25%; margin: 14px 0; border-radius:12px; overflow:hidden; }
.xb-embed iframe{ position:absolute; inset:0; width:100%; height:100%; border:0; }
.xb-audio{ width:100%; margin:10px 0; }

.xb-friend-grid{ display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:16px; }
.xb-friend-card{ padding:18px; text-align:center; text-decoration:none; color:inherit; }
.xb-friend-card img{ width:64px; height:64px; border-radius:50%; margin-bottom:10px; object-fit:cover; }
.xb-friend-card h4{ margin:0 0 6px; }
.xb-friend-card p{ margin:0; font-size:12.8px; opacity:.65; }

.xb-btn{ display:inline-flex; align-items:center; gap:6px; padding:9px 18px; border-radius:999px; border:none; background:var(--xb-accent); color:#fff; font-size:14px; cursor:pointer; transition: filter .2s, transform .2s; }
.xb-btn:hover{ filter:brightness(1.08); transform:translateY(-1px); }
.xb-btn.secondary{ background: rgba(var(--xb-fg),.08); color:inherit; }
.xb-btn.danger{ background:#e5484d; }
.xb-input, .xb-textarea, select.xb-input{ width:100%; padding:10px 14px; border-radius:12px; border:1px solid rgba(var(--xb-fg),.16); background:rgba(var(--xb-card),.6); color:inherit; font-size:14px; outline:none; }
.xb-textarea{ resize:vertical; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.xb-field{ margin-bottom:16px; }
.xb-field label{ display:block; margin-bottom:6px; font-size:13.5px; opacity:.75; font-weight:600; }
.xb-lock-note{ font-size:12px; color:#e08a1e; margin-top:4px; }

.xb-comments{ margin-top:26px; }
.xb-comment{ display:flex; gap:10px; padding:12px 0; border-bottom:1px solid rgba(var(--xb-fg),.08); }
.xb-comment img{ width:36px; height:36px; border-radius:50%; }
.xb-comment .body{ font-size:14px; line-height:1.7; }
.xb-comment .name{ font-weight:600; margin-right:8px; }
.xb-like-btn{ display:inline-flex; align-items:center; gap:6px; cursor:pointer; padding:8px 16px; border-radius:999px; background:rgba(var(--xb-fg),.06); border:none; font-size:14px; transition: transform .15s ease; }
.xb-like-btn:hover{ transform: scale(1.05); }
.xb-like-btn.liked{ background: rgba(229,72,77,.18); color:#e5484d; }

.xb-footer{ text-align:center; padding:26px 16px 40px; font-size:12.8px; opacity:.55; }

.xb-editor-wrap{ display:grid; grid-template-columns: 1fr 1fr; gap:16px; }
@media (max-width: 900px){ .xb-editor-wrap{ grid-template-columns:1fr; } }
.xb-editor-toolbar{ display:flex; flex-wrap:wrap; gap:6px; margin-bottom:10px; }
.xb-editor-toolbar button{ padding:7px 11px; border-radius:8px; border:1px solid rgba(var(--xb-fg),.14); background:rgba(var(--xb-card),.5); color:inherit; cursor:pointer; font-size:13px; }
.xb-editor-toolbar button:hover{ background: rgba(var(--xb-fg),.08); }
#xb-md-input{ width:100%; min-height:480px; }
#xb-md-preview{ min-height:480px; padding:18px; overflow:auto; }

.xb-admin-nav{ display:flex; gap:8px; flex-wrap:wrap; margin-bottom:20px; }
.xb-table-list{ width:100%; border-collapse:collapse; }
.xb-table-list th,.xb-table-list td{ text-align:left; padding:10px 8px; border-bottom:1px solid rgba(var(--xb-fg),.08); font-size:14px; }
.xb-empty{ text-align:center; padding:50px 20px; opacity:.55; }
.xb-toast{ position:fixed; bottom:24px; left:50%; transform:translateX(-50%); padding:10px 20px; border-radius:999px; z-index:100; font-size:14px; opacity:0; transition:opacity .3s, transform .3s; pointer-events:none;}
.xb-toast.show{ opacity:1; transform:translateX(-50%) translateY(-6px); }

.xb-upload-progress{ display:none; align-items:center; gap:10px; margin-top:8px; }
.xb-upload-progress-track{ flex:1; height:8px; border-radius:999px; background:rgba(var(--xb-fg),.1); overflow:hidden; }
.xb-upload-progress-bar{ height:100%; width:0%; background:var(--xb-accent); border-radius:999px; transition:width .15s ease; }
.xb-upload-progress-text{ font-size:12.5px; opacity:.65; min-width:70px; text-align:right; }
.xb-upload-progress.error .xb-upload-progress-bar{ background:#e5484d; }

.xb-range-field{ display:flex; align-items:center; gap:12px; }
.xb-range-field input[type=range]{ flex:1; accent-color: var(--xb-accent); }
.xb-range-field .xb-range-value{ min-width:42px; text-align:right; font-variant-numeric:tabular-nums; opacity:.75; font-size:13.5px; }

.xb-avatar-preview-sm{ width:44px; height:44px; border-radius:50%; object-fit:cover; margin-top:8px; display:block; }
`;
