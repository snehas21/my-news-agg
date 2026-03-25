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

const CATEGORY_RULES = [
  { key: "canada",   re: /\b(canada|canadian|ontario|quebec|british columbia|alberta|manitoba|saskatchewan|nova scotia|new brunswick|newfoundland|pei|prince edward island|toronto|vancouver|montreal|calgary|edmonton|ottawa|winnipeg|trudeau|parliament hill|rcmp|cra|cbc|tim hortons|loonie|tsa canada|nhl)\b/i },
  { key: "world",    re: /\b(war|conflict|ukraine|russia|china|israel|gaza|iran|nato|united nations|european union|election|president|prime minister|parliament|minister|treaty|diplomat\w*|military|troops|ceasefire|protest|sanctions)\b/i },
  { key: "india",    re: /\b(india|indian|modi|delhi|mumbai|bangalore|bengaluru|chennai|kolkata|hyderabad|bjp|congress party|lok sabha|rajya sabha|rupee|bse|nse|sensex|nifty|isro|iit|iim)\b/i },
  { key: "business", re: /\b(stocks?|market cap|economy|gdp|inflation|fed |federal reserve|central bank|interest rate|ipo|earnings|revenue|profit|crypto|bitcoin|ethereum|invest\w*|hedge fund|nasdaq|dow jones|s&p|financial|venture capital|acquisition|merger|layoffs?|recession|fiscal|treasury|bonds?|wall street)\b/i },
  { key: "science",  re: /\b(health|medical|drug|vaccine|cancer|disease|treatment|surgery|hospital|clinical|therapy|covid|pandemic|climate|global warming|space|nasa|spacex|research|scientists?|biology|physics|quantum|asteroid|planet|species|genome|crispr|evolution)\b/i },
  { key: "tech",     re: /\b(ai\b|artificial intelligence|machine learning|software|hardware|\bapp\b|iphone|android|google|apple|microsoft|\bmeta\b|amazon|chip|gpu|cpu|startup|developer|coding|programming|cloud|cybersecurity|data breach|hack\w*|robot\w*|gadget|smartphone|electric vehicle|\bev\b|autonomous|openai|llm|chatgpt|algorithm|data center)\b/i },
];
const TECH_SOURCES = new Set(["the verge", "hacker news", "techcrunch", "zdnet", "engadget"]);
const CANADA_SOURCES = new Set(["cbc top stories", "cbc canada"]);

const categorize = (title, desc, sourceName) => {
  const text = (title + " " + (desc || "")).toLowerCase();
  for (const { key, re } of CATEGORY_RULES) {
    if (re.test(text)) return key;
  }
  if (CANADA_SOURCES.has(sourceName.toLowerCase())) return "canada";
  if (TECH_SOURCES.has(sourceName.toLowerCase())) return "tech";
  return "other";
};

const itemToCard = (it, sourceName) => {
  const title = it.title || "(untitled)";
  const link = it.link || "#";
  const desc = safe(it.contentSnippet || it.content || "");
  const ts = humanTime(it.isoDate || it.pubDate);
  const slug = sourceSlug(sourceName);
  const cat = categorize(title, desc, sourceName);
  return `
  <article class="card" data-cat="${cat}">
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
    --bg: #f0f4f8;
    --card: #ffffff;
    --card-hover: #f8fafc;
    --border: rgba(0,0,0,0.07);
    --border-hover: rgba(99,102,241,0.45);
    --fg: #0f172a;
    --muted: #64748b;
    --muted-light: #475569;
    --accent: #6366f1;
    --accent-glow: rgba(99,102,241,0.1);
    --desc: #52637a;
    --header-bg: rgba(240,244,248,0.92);
    --shadow-sm: 0 1px 3px rgba(0,0,0,0.06), 0 1px 6px rgba(0,0,0,0.04);
    --shadow-md: 0 8px 28px rgba(0,0,0,0.1), 0 2px 8px rgba(0,0,0,0.06);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0d1117;
      --card: #161b22;
      --card-hover: #1c2330;
      --border: rgba(255,255,255,0.07);
      --border-hover: rgba(129,140,248,0.5);
      --fg: #e6edf3;
      --muted: #7d8590;
      --muted-light: #8b949e;
      --accent: #818cf8;
      --accent-glow: rgba(129,140,248,0.12);
      --desc: #8b949e;
      --header-bg: rgba(13,17,23,0.92);
      --shadow-sm: 0 1px 3px rgba(0,0,0,0.3), 0 1px 6px rgba(0,0,0,0.2);
      --shadow-md: 0 8px 28px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.25);
    }
  }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { scroll-behavior: smooth; }
  body {
    font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif;
    background: var(--bg);
    color: var(--fg);
    min-height: 100vh;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  /* ── Header ─────────────────────────────────────── */
  header {
    position: sticky;
    top: 0;
    z-index: 10;
    background: var(--header-bg);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-bottom: 1px solid var(--border);
  }
  .header-inner {
    max-width: 1280px;
    margin: 0 auto;
    padding: 13px 24px;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 9px;
    flex-shrink: 0;
  }
  .brand-icon {
    width: 34px; height: 34px;
    background: linear-gradient(135deg, #6366f1 0%, #a78bfa 100%);
    border-radius: 9px;
    display: flex; align-items: center; justify-content: center;
    font-size: 17px;
    box-shadow: 0 2px 8px rgba(99,102,241,0.35);
    flex-shrink: 0;
  }
  h1 {
    font-size: 18px;
    font-weight: 700;
    letter-spacing: -0.4px;
    background: linear-gradient(135deg, var(--fg) 0%, var(--accent) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  .header-right {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    min-width: 0;
  }
  .updated-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: rgba(16,185,129,0.08);
    border: 1px solid rgba(16,185,129,0.2);
    border-radius: 999px;
    padding: 5px 12px;
    font-size: 11.5px;
    font-weight: 500;
    color: #10b981;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .updated-dot {
    width: 6px; height: 6px;
    background: #10b981;
    border-radius: 50%;
    animation: pulse 2.5s ease-in-out infinite;
    flex-shrink: 0;
  }
  @keyframes pulse {
    0%,100% { opacity:1; transform:scale(1); }
    50% { opacity:.35; transform:scale(.7); }
  }
  .sources {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .pill {
    padding: 3px 9px;
    border: 1px solid var(--border);
    border-radius: 999px;
    color: var(--muted);
    font-size: 11px;
    font-weight: 500;
    background: var(--card);
    cursor: default;
    white-space: nowrap;
    box-shadow: var(--shadow-sm);
  }

  /* ── Main ────────────────────────────────────────── */
  main {
    max-width: 1280px;
    margin: 0 auto;
    padding: 28px 24px 80px;
  }

  /* ── Category tabs ───────────────────────────────── */
  .tabs {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    padding: 2px 0 14px;
    margin-bottom: 20px;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
  }
  .tabs::-webkit-scrollbar { display: none; }
  .tab {
    flex-shrink: 0;
    padding: 8px 16px;
    min-height: 36px;
    border: 1.5px solid var(--border);
    border-radius: 999px;
    background: var(--card);
    color: var(--muted-light);
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all .18s ease;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
    box-shadow: var(--shadow-sm);
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
  }
  .tab:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-glow); }
  .tab.active { background: var(--accent); border-color: var(--accent); color: #fff; box-shadow: 0 4px 14px rgba(99,102,241,0.4); }
  .tab-count {
    font-size: 11px;
    padding: 1px 6px;
    border-radius: 999px;
    background: rgba(0,0,0,0.08);
    color: inherit;
    opacity: 0.7;
  }
  .tab.active .tab-count { background: rgba(255,255,255,0.22); opacity: 1; }

  /* ── Grid ────────────────────────────────────────── */
  .grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
  }

  /* ── Cards ───────────────────────────────────────── */
  .card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 18px 20px 20px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    transition: transform .2s ease, box-shadow .22s ease, border-color .2s ease;
    box-shadow: var(--shadow-sm);
    position: relative;
    overflow: hidden;
    animation: fadeUp .3s ease both;
  }
  .card::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
    background: var(--cat-color, var(--accent));
    border-radius: 14px 14px 0 0;
  }
  .card[data-cat="canada"]   { --cat-color: #ef4444; }
  .card[data-cat="world"]    { --cat-color: #f59e0b; }
  .card[data-cat="india"]    { --cat-color: #f97316; }
  .card[data-cat="tech"]     { --cat-color: #6366f1; }
  .card[data-cat="business"] { --cat-color: #10b981; }
  .card[data-cat="science"]  { --cat-color: #06b6d4; }
  .card[data-cat="other"]    { --cat-color: #94a3b8; }
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .card:hover {
    transform: translateY(-3px);
    box-shadow: var(--shadow-md);
    border-color: var(--border-hover);
  }
  .card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .source-badge {
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: .05em;
    padding: 3px 9px;
    border-radius: 999px;
    text-transform: uppercase;
    flex-shrink: 0;
    max-width: 170px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* Source colours */
  .src-bbc-world                  { background:rgba(220,38,38,.1);   color:#dc2626; border:1px solid rgba(220,38,38,.22); }
  .src-cbc-top-stories            { background:rgba(196,30,58,.1);   color:#c41e3a; border:1px solid rgba(196,30,58,.22); }
  .src-cbc-canada                 { background:rgba(196,30,58,.1);   color:#c41e3a; border:1px solid rgba(196,30,58,.22); }
  .src-the-verge                  { background:rgba(219,39,119,.08); color:#db2777; border:1px solid rgba(219,39,119,.2); }
  .src-hacker-news--top-          { background:rgba(251,146,60,.1);  color:#ea580c; border:1px solid rgba(234,88,12,.22); }
  .src-techcrunch--top-           { background:rgba(5,150,105,.08);  color:#059669; border:1px solid rgba(5,150,105,.2); }
  .src-zdnet--top-                { background:rgba(37,99,235,.08);  color:#2563eb; border:1px solid rgba(37,99,235,.2); }
  .src-engadget--top-             { background:rgba(124,58,237,.08); color:#7c3aed; border:1px solid rgba(124,58,237,.2); }
  .src-yahoo-finance              { background:rgba(99,102,241,.08); color:#4f46e5; border:1px solid rgba(99,102,241,.2); }
  .src-ars-technica               { background:rgba(234,88,12,.08);  color:#ea580c; border:1px solid rgba(234,88,12,.2); }
  .src-times-of-india-top-stores  { background:rgba(234,88,12,.1);   color:#c2410c; border:1px solid rgba(234,88,12,.22); }
  .src-times-of-india-india       { background:rgba(234,88,12,.1);   color:#c2410c; border:1px solid rgba(234,88,12,.22); }
  .src-ndtv-top-stories           { background:rgba(37,99,235,.08);  color:#2563eb; border:1px solid rgba(37,99,235,.2); }
  .src-indian-express-trending    { background:rgba(5,150,105,.08);  color:#059669; border:1px solid rgba(5,150,105,.2); }
  .src-custom-feed                { background:rgba(99,102,241,.08); color:#4f46e5; border:1px solid rgba(99,102,241,.2); }
  .card-time {
    font-size: 11px;
    color: var(--muted);
    white-space: nowrap;
    flex-shrink: 0;
  }
  .card h3 {
    font-size: 15px;
    font-weight: 600;
    line-height: 1.5;
    letter-spacing: -0.1px;
  }
  .card h3 a {
    color: var(--fg);
    text-decoration: none;
    transition: color .15s;
  }
  .card h3 a:hover { color: var(--accent); }
  .desc {
    font-size: 13px;
    line-height: 1.65;
    color: var(--desc);
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  /* ── Footer ──────────────────────────────────────── */
  footer {
    border-top: 1px solid var(--border);
    padding: 20px 24px;
    text-align: center;
    font-size: 12px;
    color: var(--muted);
  }
  footer a { color: var(--muted-light); text-decoration: none; }
  footer a:hover { color: var(--accent); }

  /* ── Responsive – tablet ─────────────────────────── */
  @media (max-width: 1024px) {
    .grid { grid-template-columns: repeat(2, 1fr); }
    .sources { display: none; }
  }

  /* ── Responsive – mobile ─────────────────────────── */
  @media (max-width: 640px) {
    .header-inner { padding: 11px 16px; }
    h1 { font-size: 16px; }
    .brand-icon { width: 30px; height: 30px; font-size: 15px; }
    .updated-badge { font-size: 11px; padding: 4px 10px; }
    main { padding: 16px 12px 60px; }
    .grid { grid-template-columns: 1fr; gap: 10px; }
    .tabs { gap: 5px; padding-bottom: 10px; margin-bottom: 14px; }
    .tab { padding: 8px 13px; font-size: 12.5px; min-height: 40px; }
    .card { padding: 14px 15px 16px; gap: 9px; }
    .card h3 { font-size: 14.5px; }
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
      <div class="header-right">
        <span class="updated-badge">
          <span class="updated-dot"></span>
          Updated ${updatedAt}
        </span>
        <div class="sources">
          ${sourcesList}
        </div>
      </div>
    </div>
  </header>

  <main>
    <nav class="tabs" id="cat-tabs" aria-label="Filter by category">
      <button class="tab active" data-tab="all">All <span class="tab-count"></span></button>
      <button class="tab" data-tab="canada">Canada <span class="tab-count"></span></button>
      <button class="tab" data-tab="world">World <span class="tab-count"></span></button>
      <button class="tab" data-tab="india">India <span class="tab-count"></span></button>
      <button class="tab" data-tab="tech">Tech <span class="tab-count"></span></button>
      <button class="tab" data-tab="business">Business <span class="tab-count"></span></button>
      <button class="tab" data-tab="science">Science &amp; Health <span class="tab-count"></span></button>
      <button class="tab" data-tab="other">Other <span class="tab-count"></span></button>
    </nav>
    <section class="grid" id="main-grid">${cardsHTML}</section>

  </main>

  <footer>
    Built with <a href="https://pages.github.com" target="_blank" rel="noopener">GitHub Pages</a> &amp; GitHub Actions &nbsp;·&nbsp; No cookies &nbsp;·&nbsp; Links go to original publishers.
  </footer>


<script>
(function () {
  // ── Tab filtering ──────────────────────────────────
  function allCards() { return document.querySelectorAll('.card[data-cat]'); }

  function updateTabCounts() {
    const tabs = document.querySelectorAll('[data-tab]');
    const counts = { all: 0 };
    allCards().forEach(c => {
      counts.all++;
      const cat = c.dataset.cat;
      counts[cat] = (counts[cat] || 0) + 1;
    });
    tabs.forEach(tab => {
      const cat = tab.dataset.tab;
      const n = counts[cat] || 0;
      tab.querySelector('.tab-count').textContent = n;
      tab.hidden = false;
    });
  }

  function initTabs() {
    const tabs = document.querySelectorAll('[data-tab]');
    let active = 'all';
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        active = tab.dataset.tab;
        tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === active));
        allCards().forEach(c => {
          c.style.display = (active === 'all' || c.dataset.cat === active) ? '' : 'none';
        });
      });
    });
    updateTabCounts();
  }

  initTabs();
})();
</script>
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