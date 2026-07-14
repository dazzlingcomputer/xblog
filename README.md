# 🪟 Xblog

一个可以完整部署到 **Cloudflare Workers** 的动态个人博客系统，基于 [Hono](https://hono.dev) 构建。

界面采用 **类 UWP（Fluent Design）液态玻璃 / Acrylic 效果**，动画全部使用 CSS `transform`/`opacity` 驱动，低端设备也能流畅浏览。博客数据（文章、友链、关于、图片/音频/视频等资源）存储在你自己的 **GitHub 仓库** 中，网站的运行时设置存储在 **Cloudflare KV**，评论与点赞则复用 GitHub 仓库的 **Issues** 功能实现。

> ⚠️ 本项目为**真实可部署**的个人博客，而非演示 Demo。仓库根目录的 `src/`（React + Vite）仅用于本仓库自身的可视化预览/说明页面；**真正部署到 Cloudflare Workers 的完整源码在 [`worker/`](./worker) 目录**。

---

## ✨ 功能特性

- 📱 四个标签页：**首页 / 文章 / 友链 / 关于**，支持顶部横向标签或侧边垂直标签两种布局（可在后台切换）
- 🧊 UWP 风格液态玻璃 UI，支持自定义背景图片/视频、强调色、玻璃模糊强度
- 🔍 右上角搜索框（登录按钮左侧），可实时搜索已发布文章
- 📣 首页公告（后台可编辑）+ 最近发布文章 + 支持指定文章**置顶**显示
- 🗂️ 文章列表支持按**发布时间 / 浏览次数 / 自定义分类 / 标签**筛选与排序
- 💬 使用 GitHub Issues 实现文章评论、👍 点赞（访客需使用 GitHub 账号登录）
- 👤 网站右上角登录：点击"登录"跳转 GitHub OAuth 授权，登录后显示头像与用户名
- 🗃️ 文章内容、友链、关于信息、图片/音频/视频、头像、网站图标等均通过 GitHub API 存取，全部可版本化管理
- ⚙️ 网站设置存储在 Cloudflare KV，同时支持通过**环境变量**覆盖（优先级最高，适合团队/多环境部署）
- 🔐 `/admin` 管理后台：初始密码 `admin`，登录后可修改：
  - 网站标题、副标题、favicon
  - 左上角个人头像
  - 是否启用垂直标签页
  - 背景图片/视频上传
  - 强调色、玻璃模糊强度、公告、置顶文章
  - 新建/编辑/删除文章、友链管理、关于页管理
  - 修改管理员密码
- 📝 类 Word 的 Markdown 编辑器：工具栏一键加粗/斜体/标题/列表/表格/引用等，支持拖拽上传图片/音频，支持一键插入 **B 站 / YouTube** 视频嵌入播放
- 🛡️ 全局错误兜底处理，不会向访客暴露 `Internal Server Error`，出现异常会展示友好的错误页面

---

## 📁 目录结构

```
.
├── worker/                 # ⭐ 真正部署到 Cloudflare Workers 的 Hono 项目（核心）
│   ├── src/
│   │   ├── index.ts        # Worker 入口，路由挂载 + 全局错误处理
│   │   ├── routes/         # 前台页面 / 登录 / 评论点赞 / 管理后台 路由
│   │   ├── lib/            # GitHub 存储、KV 设置、鉴权、Markdown 渲染、页面布局
│   │   └── assets/         # 内联的 CSS / 前端 JS（无需额外的静态资源绑定）
│   ├── wrangler.toml       # Cloudflare Workers 配置（KV 绑定、环境变量）
│   ├── package.json
│   └── .dev.vars.example   # 本地开发环境变量示例
├── src/                    # 本仓库预览用的 React + Vite 页面（非部署产物）
└── README.md
```

---

## 🚀 部署指南（推荐：Cloudflare 控制台网页 UI，无需命令行）

### 第一步：准备一个 GitHub 数据仓库

1. 在 GitHub 上新建一个仓库，例如 `xblog-storage`（**公开或私有均可**，建议私有以保护隐私内容）。
2. 生成一个 **Personal Access Token**：
   - 打开 GitHub → Settings → Developer settings → **Personal access tokens** → **Fine-grained tokens**（或经典 Token）
   - 权限勾选该仓库的 `Contents: Read and write`、`Issues: Read and write`（用于评论/点赞）
   - 复制生成的 Token，稍后要填入 Cloudflare 环境变量 `GITHUB_TOKEN`

### 第二步：（可选）创建 GitHub OAuth App 用于访客登录评论

1. 打开 GitHub → Settings → Developer settings → **OAuth Apps** → **New OAuth App**
2. `Homepage URL` 填写你的 Worker 访问地址，例如 `https://xblog.yourname.workers.dev`
3. `Authorization callback URL` 填写 `https://xblog.yourname.workers.dev/callback`
4. 创建后得到 `Client ID` 和 `Client Secret`，稍后填入环境变量

> 如果暂时不需要评论/点赞登录功能，可以跳过此步，网站其余功能不受影响。

### 第三步：在 Cloudflare 控制台创建 Worker

1. 登录 [Cloudflare 控制台](https://dash.cloudflare.com/) → 左侧菜单 **Workers 和 Pages**
2. 点击 **创建应用程序 → 创建 Worker**，随便起个名字（如 `xblog`），点击部署（先部署一个默认模板即可）
3. 部署完成后，进入该 Worker 的管理页面，点击顶部 **"编辑代码" / Edit Code（Quick Edit）**：
   - 将 `worker/src` 目录下所有源码内容对应粘贴进去；**更推荐使用下方"Git 集成"方式**，见下一节，一次性同步整个 `worker/` 目录，无需手动复制粘贴每个文件。

#### 推荐方式：使用 Git 集成自动部署（无需命令行）

1. 将本项目推送到你自己的 GitHub 仓库（例如 `xblog`）
2. 在 Cloudflare 控制台 **Workers 和 Pages → 创建应用程序 → 连接到 Git**
3. 选择你刚推送的仓库，"根目录"（Root directory）设置为 `worker`
4. 构建命令留空或填 `npm install`，输出目录不需要（Workers 项目无需构建产物目录）
5. 部署命令使用 Cloudflare 自动检测的 Workers 部署方式（Wrangler），首次连接时按照页面提示确认 `worker/wrangler.toml` 即可
6. 点击保存并部署，之后你每次 `git push` 都会自动触发重新部署

### 第四步：创建 KV 命名空间并绑定

1. 在 Cloudflare 控制台 **存储和数据库 → KV**，点击 **创建命名空间**，命名为 `SETTINGS_KV`
2. 回到你的 Worker → **设置 → 变量和机密 (Variables and Secrets)** → 绑定 KV 命名空间：
   - 变量名称填 `SETTINGS_KV`，选择刚创建的命名空间
3. 如果你使用 `wrangler.toml` 部署，把生成的命名空间 ID 填入 `worker/wrangler.toml` 中 `[[kv_namespaces]]` 的 `id` 字段

### 第五步：配置环境变量 / 机密

在 Worker 的 **设置 → 变量和机密** 中添加（类型选择"机密 Secret"的项，请务必选择 Secret 而不是明文 Variable）：

| 变量名 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `GITHUB_TOKEN` | 机密 | ✅ | 第一步生成的 Personal Access Token |
| `GITHUB_OWNER` | 变量 | ✅ | GitHub 用户名 |
| `GITHUB_REPO` | 变量 | ✅ | 数据仓库名，如 `xblog-storage` |
| `GITHUB_BRANCH` | 变量 | 可选 | 默认 `main` |
| `SESSION_SECRET` | 机密 | 建议 | 任意随机字符串，用于签名登录 Cookie |
| `ADMIN_PASSWORD` | 机密 | 可选 | 设置后将替代后台默认/自定义密码，且后台无法修改（优先级最高）。不设置则初始密码为 `admin`，可在后台修改 |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | 机密 | 可选 | 第二步创建的 OAuth App 信息，用于访客登录评论 |
| `SITE_TITLE` / `SITE_SUBTITLE` / `SITE_FAVICON` / `SITE_AVATAR` / `SITE_BACKGROUND_URL` / `SITE_BACKGROUND_TYPE` / `SITE_VERTICAL_TABS` / `SITE_ACCENT_COLOR` | 变量 | 可选 | 设置后将覆盖后台对应配置项，且后台不可修改 |
| `SITE_URL` | 变量 | 建议 | 完整站点地址，如 `https://xblog.yourname.workers.dev`，用于 OAuth 回调拼接 |

修改完成后点击 **部署/保存**，Cloudflare 会自动重新部署使配置生效。

### 第六步：访问网站

- 打开 `https://你的Worker域名.workers.dev`，即可看到博客首页
- 打开 `https://你的Worker域名.workers.dev/admin`，输入初始密码 `admin` 进入管理后台，建议登录后立即修改密码
- 在后台「网站设置」中完善标题、头像、背景、公告等信息，在「文章管理」中发布你的第一篇文章

---

## 🖥️ 本地开发（使用命令行 / Wrangler CLI，可选）

如果你更熟悉命令行，也可以本地开发调试：

```bash
cd worker
npm install
cp .dev.vars.example .dev.vars   # 填写你的 Token 等信息
npx wrangler kv namespace create SETTINGS_KV   # 创建 KV 并把生成的 id 填入 wrangler.toml
npm run dev                      # 本地预览 http://localhost:8787
npm run deploy                   # 部署到 Cloudflare
```

---

## 📝 Markdown 编辑器语法说明

除标准 Markdown 语法外，新建文章页面额外支持：

- 插入图片/音频：工具栏点击「🖼️ 图片」「🎵 音频」按钮上传，或直接把文件拖拽到编辑框
- 嵌入 B 站视频：`:::bilibili BV1xxxxxxx:::`
- 嵌入 YouTube 视频：`:::youtube 视频ID:::`

均可通过编辑器工具栏一键插入，无需记忆语法。

---

## 🔒 关于密码与安全

- 管理后台会话、访客登录会话均使用 `SESSION_SECRET` 进行 HMAC 签名后存储在 HttpOnly Cookie 中，请务必在生产环境设置一个复杂的 `SESSION_SECRET`
- 强烈建议尽快修改默认密码 `admin`
- `GITHUB_TOKEN` 权限建议仅授予目标数据仓库，不要使用具有全部仓库权限的 Token

---

## 🧩 技术栈

- [Hono](https://hono.dev) — 运行在 Cloudflare Workers 上的轻量 Web 框架
- Cloudflare Workers + KV
- GitHub REST API（Contents API 存储数据资源，Issues API 实现评论/点赞，OAuth 实现访客登录）
- 原生 CSS + 少量原生 JS 实现 UWP 液态玻璃视觉与交互，无前端框架依赖，体积小、加载快、低端设备流畅运行

---

## 📄 License

MIT
