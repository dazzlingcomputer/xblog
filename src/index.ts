import { Hono } from "hono";
import type { Env } from "./types";
import { site } from "./routes/site";
import { authRoutes } from "./routes/auth";
import { commentsRoutes } from "./routes/comments";
import { adminRoutes } from "./routes/admin";
import { STYLE_CSS } from "./assets/style";
import { APP_JS } from "./assets/app";
import { EDITOR_JS } from "./assets/editor";
import { errorPage } from "./lib/layout";
import { getSettings } from "./lib/settings";

const app = new Hono<{ Bindings: Env }>();

// ---------------- 静态资源（内联，无需额外的 assets 绑定，部署更简单可靠） ----------------
app.get("/assets/style.css", (c) => c.text(STYLE_CSS, 200, { "Content-Type": "text/css; charset=utf-8", "Cache-Control": "public, max-age=86400" }));
app.get("/assets/app.js", (c) => c.text(APP_JS, 200, { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "public, max-age=86400" }));
app.get("/assets/editor.js", (c) => c.text(EDITOR_JS, 200, { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "public, max-age=86400" }));

// ---------------- 业务路由 ----------------
app.route("/", site);
app.route("/", authRoutes);
app.route("/", commentsRoutes);
app.route("/", adminRoutes);

// ---------------- 404 ----------------
app.notFound(async (c) => {
  let settings;
  try {
    settings = await getSettings(c.env);
  } catch {
    settings = undefined;
  }
  return c.html(errorPage(404, "你访问的页面不存在，请检查链接是否正确。", settings), 404);
});

// ---------------- 全局错误兜底：绝不暴露 Internal Server Error ----------------
app.onError(async (err, c) => {
  console.error("Xblog 运行时错误：", err);
  let settings;
  try {
    settings = await getSettings(c.env);
  } catch {
    settings = undefined;
  }
  return c.html(
    errorPage(500, "服务器开小差了，请稍后重试。如果问题持续存在，请检查环境变量 / KV / GitHub Token 是否配置正确。", settings),
    500
  );
});

export default app;
