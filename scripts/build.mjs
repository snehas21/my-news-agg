import fs from "fs/promises";
import path from "path";
import Parser from "rss-parser";
import sanitizeHtml from "sanitize-html";
import { DateTime } from "luxon";

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");

const parser = new Parser({
  timeout: 15000,
  customFields: { item: ["category", "categories"] }
});

const safe = (html) =>
  sanitizeHtml(html || "", {
    allowedTags: ["b","i","em","strong","a","code","pre","br","p","ul","ol","li","blockquote","img"],
    allowedAttributes: { a: ["href", "title", "target", "rel"], img: ["src", "alt"] },
    transformTags: { a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer" }) }
  });

const readJSON = async (p) => JSON.parse(await fs.readFile(p, "utf8"));
const writeFile = (p, c) => fs.writeFile(p, c, "utf8");

const ensureDir = async (d) => fs.mkdir(d, { recursive: true });

const byPubDateDesc = (a, b) => new Date(b.isoDate || b.pubDate || 0) - new Date(a.isoDate || a.pubDate || 0);

const dedupe = (items) => {
  const seen = new Set();
  return items.filter((it) => {
    const key = (it.link || "").split("?")[0];
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const humanTime = (dateStr) => {
  const dt = DateTime.fromJSDate(new Date(dateStr));
  if (!dt.isValid) return "";
  return dt.toRelative({ base: DateTime.now() }) || dt.toFormat("yyyy-LL-dd HH:mm ZZZZ");
};

const sourceSlug = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, "-");

const itemToCard = (it, sourceName) => {
  const title = it.title || "(untitled)";
  const link = it.link || "#";
  const desc = safe(it.contentSnippet || it.content || "");
  const ts = humanTime(it.isoDate || it.pubDate);
  const slug = sourceSlug(sourceName);
  return `
  <article class="card">
    <div class="card-top">
      <span class="source-badge src-${slug}">${sourceName}</span>
      <time class="card-time">${ts}</time>
    </div>
    <h3><a href="${link}" target="_blank" rel="noopener">${title}</a></h3>
    ${desc ? `<p class="desc">${desc}</p>` : ""}
  </article>`;
};

const pageTemplate = (cardsHTML, updatedAt, sourcesList) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>My News – Aggregated</title>
<meta name="description" content="A fast, free, static news aggregator."/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"/>
<style>
  :root {
    --bg: #06080d;
    --surface: #0d1117;
    --card: #111827;
    --card-hover: #161f2e;
    --border: rgba(255,255,255,0.06);
    --border-hover: rgba(99,102,241,0.4);
    --fg: #f1f5f9;
    --muted: #64748b;
    --muted-light: #94a3b8;
    --accent: #6366f1;
    --accent-glow: rgba(99,102,241,0.15);
    --desc: #9ca3af;
  }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { scroll-behavior: smooth; }
  body {
    font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif;
    background: var(--bg);
    color: var(--fg);
    min-height: 100vh;
    -webkit-font-smoothing: antialiased;
  }

  /* ── Header ─────────────────────────────────────── */
  header {
    position: sticky;
    top: 0;
    z-index: 10;
    background: rgba(6,8,13,0.85);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-bottom: 1px solid var(--border);
  }
  .header-inner {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px 24px;
    display: flex;
    align-items: center;
    gap: 24px;
    flex-wrap: wrap;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }
  .brand-icon {
    width: 32px; height: 32px;
    background: linear-gradient(135deg, #6366f1, #a78bfa);
    border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    font-size: 16px;
  }
  h1 {
    font-size: 20px;
    font-weight: 700;
    letter-spacing: -0.3px;
    background: linear-gradient(135deg, #f1f5f9, #94a3b8);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  .header-meta {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .updated-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: rgba(99,102,241,0.1);
    border: 1px solid rgba(99,102,241,0.2);
    border-radius: 999px;
    padding: 4px 12px;
    font-size: 12px;
    color: var(--muted-light);
    white-space: nowrap;
  }
  .updated-dot {
    width: 6px; height: 6px;
    background: #34d399;
    border-radius: 50%;
    animation: pulse 2s ease-in-out infinite;
  }
  @keyframes pulse {
    0%,100% { opacity:1; transform:scale(1); }
    50% { opacity:.5; transform:scale(.8); }
  }
  .sources {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .pill {
    padding: 3px 10px;
    border: 1px solid var(--border);
    border-radius: 999px;
    color: var(--muted-light);
    font-size: 11px;
    font-weight: 500;
    background: rgba(255,255,255,0.03);
    transition: border-color .2s, color .2s;
    cursor: default;
  }
  .pill:hover { border-color: var(--accent); color: var(--fg); }

  /* ── Main grid ───────────────────────────────────── */
  main {
    max-width: 1200px;
    margin: 0 auto;
    padding: 32px 24px 80px;
  }
  .grid-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 24px;
  }
  .grid-label {
    font-size: 13px;
    font-weight: 500;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: .08em;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    gap: 16px;
  }

  /* ── Cards ───────────────────────────────────────── */
  .card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    transition: background .2s, border-color .25s, transform .2s, box-shadow .25s;
    cursor: default;
  }
  .card:hover {
    background: var(--card-hover);
    border-color: var(--border-hover);
    transform: translateY(-2px);
    box-shadow: 0 8px 32px rgba(0,0,0,.4), 0 0 0 1px var(--border-hover), 0 4px 16px var(--accent-glow);
  }
  .card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .source-badge {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: .04em;
    padding: 3px 9px;
    border-radius: 999px;
    text-transform: uppercase;
    flex-shrink: 0;
  }
  /* Source colours */
  .src-bbc-world        { background:rgba(187,0,0,.15);   color:#f87171; border:1px solid rgba(187,0,0,.3); }
  .src-reuters-world    { background:rgba(255,140,0,.12);  color:#fb923c; border:1px solid rgba(255,140,0,.25); }
  .src-the-verge        { background:rgba(237,100,166,.12);color:#f472b6; border:1px solid rgba(237,100,166,.25); }
  .src-hacker-news      { background:rgba(255,102,0,.12);  color:#fb923c; border:1px solid rgba(255,102,0,.25); }
  .src-techcrunch       { background:rgba(16,185,129,.12); color:#34d399; border:1px solid rgba(16,185,129,.25); }
  .src-zdnet            { background:rgba(96,165,250,.12); color:#60a5fa; border:1px solid rgba(96,165,250,.25); }
  .src-engadget         { background:rgba(168,85,247,.12); color:#c084fc; border:1px solid rgba(168,85,247,.25); }
  /* fallback for unknown sources */
  .source-badge:not([class*=" src-"]) { background:rgba(100,116,139,.12); color:#94a3b8; border:1px solid rgba(100,116,139,.25); }
  .card-time {
    font-size: 11px;
    color: var(--muted);
    white-space: nowrap;
    flex-shrink: 0;
  }
  .card h3 {
    font-size: 16px;
    font-weight: 600;
    line-height: 1.45;
    letter-spacing: -0.1px;
  }
  .card h3 a {
    color: var(--fg);
    text-decoration: none;
    transition: color .15s;
  }
  .card h3 a:hover { color: #a5b4fc; }
  .desc {
    font-size: 13.5px;
    line-height: 1.6;
    color: var(--desc);
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  /* ── Footer ──────────────────────────────────────── */
  footer {
    border-top: 1px solid var(--border);
    padding: 24px;
    text-align: center;
    font-size: 12px;
    color: var(--muted);
    max-width: 1200px;
    margin: 0 auto;
  }
  footer a { color: var(--muted-light); text-decoration: none; }
  footer a:hover { color: var(--fg); }

  /* ── Responsive ──────────────────────────────────── */
  @media (max-width: 640px) {
    .header-inner { padding: 16px; gap: 12px; }
    main { padding: 20px 16px 60px; }
    .grid { grid-template-columns: 1fr; gap: 12px; }
    .header-meta { width: 100%; }
  }
</style>
</head>
<body>
  <header>
    <div class="header-inner">
      <div class="brand">
        <div class="brand-icon">📰</div>
        <h1>My News</h1>
      </div>
      <div class="header-meta">
        <span class="updated-badge">
          <span class="updated-dot"></span>
          Updated ${updatedAt}
        </span>
        <div class="sources">${sourcesList}</div>
      </div>
    </div>
  </header>
  <main>
    <div class="grid-header">
      <span class="grid-label">Latest Stories</span>
    </div>
    <section class="grid">
      ${cardsHTML}
    </section>
  </main>
  <footer>
    <div class="wrap">
      Built with <a href="https://pages.github.com" target="_blank" rel="noopener">GitHub Pages</a> &amp; GitHub Actions &nbsp;·&nbsp; No cookies &nbsp;·&nbsp; Links go to original publishers.
    </div>
  </footer>
</body>
</html>`;

const sourcePill = (name) => `<span class="pill src-${sourceSlug(name)}">${name}</span>`;

(async () => {
  await ensureDir(DIST);
  const { sources } = await readJSON(path.join(ROOT, "feeds.json"));

  let all = [];
  for (const src of sources) {
    try {
      const feed = await parser.parseURL(src.url);
      const items = (feed.items || []).slice(0, src.maxItems || 10).map(it => ({ ...it, _source: src.name }));
      all.push(...items);
    } catch (e) {
      console.error("Failed:", src.url, e.message);
    }
  }

  all = dedupe(all).sort(byPubDateDesc);

  const cards = all.map(it => itemToCard(it, it._source)).join("\n");
  const updatedAt = DateTime.now().toFormat("yyyy-LL-dd HH:mm ZZZZ");
  const sourcesHTML = sources.map(s => sourcePill(s.name)).join("");

  const html = pageTemplate(cards, updatedAt, sourcesHTML);
  await writeFile(path.join(DIST, "index.html"), html);
  console.log(`Wrote ${all.length} items to dist/index.html`);
})();