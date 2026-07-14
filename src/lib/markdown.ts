// 轻量 Markdown 渲染器，零依赖，专为 Workers 运行时设计
// 支持：标题/加粗/斜体/删除线/行内代码/代码块/引用/列表/表格/链接/图片/音频/分割线
// 以及自定义嵌入语法：
//   :::bilibili BV1xxxxxxx:::   -> 嵌入 B 站播放器
//   :::youtube dQw4w9WgXcQ:::   -> 嵌入 YouTube 播放器

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inline(text: string): string {
  let t = escapeHtml(text);
  // 图片/音频 ![alt](url)
  t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (_m, alt, url, title) => {
    const isAudio = /\.(mp3|wav|ogg|m4a)(\?.*)?$/i.test(url);
    if (isAudio) {
      return `<audio class="xb-audio" controls preload="none" src="${url}"></audio>`;
    }
    return `<img class="xb-img" loading="lazy" src="${url}" alt="${alt}" ${title ? `title="${title}"` : ""}/>`;
  });
  // 链接 [text](url)
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (_m, text2, url, title) => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" ${title ? `title="${title}"` : ""}>${text2}</a>`;
  });
  // 加粗/斜体/删除线/行内代码
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  t = t.replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>");
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  t = t.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  return t;
}

function embedBlock(tag: string, arg: string): string {
  const id = arg.trim();
  if (tag === "bilibili") {
    return `<div class="xb-embed"><iframe src="https://player.bilibili.com/player.html?bvid=${encodeURIComponent(
      id
    )}&autoplay=0" scrolling="no" frameborder="0" allowfullscreen loading="lazy"></iframe></div>`;
  }
  if (tag === "youtube") {
    return `<div class="xb-embed"><iframe src="https://www.youtube.com/embed/${encodeURIComponent(
      id
    )}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`;
  }
  return "";
}

export function renderMarkdown(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let i = 0;
  let inCode = false;
  let codeBuf: string[] = [];
  let codeLang = "";
  let listBuf: { ordered: boolean; items: string[] } | null = null;
  let quoteBuf: string[] = [];
  let tableBuf: string[][] = [];
  let inTable = false;

  const flushList = () => {
    if (listBuf) {
      const tagName = listBuf.ordered ? "ol" : "ul";
      html.push(`<${tagName} class="xb-list">${listBuf.items.map((it) => `<li>${inline(it)}</li>`).join("")}</${tagName}>`);
      listBuf = null;
    }
  };
  const flushQuote = () => {
    if (quoteBuf.length) {
      html.push(`<blockquote class="xb-quote">${quoteBuf.map((l) => `<p>${inline(l)}</p>`).join("")}</blockquote>`);
      quoteBuf = [];
    }
  };
  const flushTable = () => {
    if (tableBuf.length) {
      const [head, , ...rows] = tableBuf;
      html.push('<div class="xb-table-wrap"><table class="xb-table"><thead><tr>');
      head.forEach((c) => html.push(`<th>${inline(c.trim())}</th>`));
      html.push("</tr></thead><tbody>");
      rows.forEach((r) => {
        html.push("<tr>");
        r.forEach((c) => html.push(`<td>${inline(c.trim())}</td>`));
        html.push("</tr>");
      });
      html.push("</tbody></table></div>");
      tableBuf = [];
      inTable = false;
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    // 代码块
    if (/^```/.test(line)) {
      if (!inCode) {
        flushList();
        flushQuote();
        flushTable();
        inCode = true;
        codeLang = line.replace(/^```/, "").trim();
        codeBuf = [];
      } else {
        html.push(
          `<pre class="xb-pre"><code class="language-${escapeHtml(codeLang)}">${escapeHtml(
            codeBuf.join("\n")
          )}</code></pre>`
        );
        inCode = false;
      }
      i++;
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      i++;
      continue;
    }

    // 自定义嵌入
    const embedMatch = line.match(/^:::(bilibili|youtube)\s+([^\s:]+)\s*:::$/);
    if (embedMatch) {
      flushList();
      flushQuote();
      flushTable();
      html.push(embedBlock(embedMatch[1], embedMatch[2]));
      i++;
      continue;
    }

    // 分割线
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      flushList();
      flushQuote();
      flushTable();
      html.push("<hr class='xb-hr'/>");
      i++;
      continue;
    }

    // 标题
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushList();
      flushQuote();
      flushTable();
      const level = h[1].length;
      html.push(`<h${level} class="xb-h${level}">${inline(h[2])}</h${level}>`);
      i++;
      continue;
    }

    // 表格
    if (/^\|.*\|$/.test(line.trim()) && lines[i + 1] && /^\|?[\s:|-]+\|?$/.test(lines[i + 1].trim())) {
      flushList();
      flushQuote();
      inTable = true;
      const parseRow = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|");
      tableBuf.push(parseRow(line));
      tableBuf.push(parseRow(lines[i + 1]));
      i += 2;
      while (i < lines.length && /^\|.*\|$/.test(lines[i].trim())) {
        tableBuf.push(parseRow(lines[i]));
        i++;
      }
      flushTable();
      continue;
    }

    // 引用
    if (/^>\s?/.test(line)) {
      flushList();
      quoteBuf.push(line.replace(/^>\s?/, ""));
      i++;
      continue;
    } else if (quoteBuf.length) {
      flushQuote();
    }

    // 列表
    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    const ul = line.match(/^\s*[-*+]\s+(.*)$/);
    if (ol || ul) {
      const ordered = !!ol;
      const text = (ol ? ol[1] : ul![1]).trim();
      if (!listBuf || listBuf.ordered !== ordered) {
        flushList();
        listBuf = { ordered, items: [] };
      }
      listBuf.items.push(text);
      i++;
      continue;
    } else if (listBuf) {
      flushList();
    }

    // 空行
    if (!line.trim()) {
      i++;
      continue;
    }

    // 段落
    html.push(`<p class="xb-p">${inline(line)}</p>`);
    i++;
  }
  flushList();
  flushQuote();
  flushTable();
  if (inCode && codeBuf.length) {
    html.push(`<pre class="xb-pre"><code>${escapeHtml(codeBuf.join("\n"))}</code></pre>`);
  }
  return html.join("\n");
}

export function extractExcerpt(md: string, len = 120): string {
  const plain = md
    .replace(/```[\s\S]*?```/g, "")
    .replace(/:::[a-z]+[^:]*:::/g, "")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/[#>*`_~-]/g, "")
    .replace(/\n+/g, " ")
    .trim();
  return plain.length > len ? plain.slice(0, len) + "…" : plain;
}
