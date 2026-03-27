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

/* ── Add-feed button (header) ────────────────────── */
  .btn-add-feed {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 6px 13px;
    font-family: inherit;
    font-size: 12px;
    font-weight: 600;
    color: var(--accent);
    background: var(--accent-glow);
    border: 1.5px solid rgba(99,102,241,0.3);
    border-radius: 999px;
    cursor: pointer;
    transition: all .18s ease;
    white-space: nowrap;
    flex-shrink: 0;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
  }
  .btn-add-feed:hover { background: var(--accent); color: #fff; border-color: var(--accent); box-shadow: 0 4px 12px rgba(99,102,241,0.35); }

  /* ── Feed modal ──────────────────────────────────── */
  .modal-overlay { display: none; position: fixed; inset: 0; background: rgba(15,23,42,0.55); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); z-index: 100; align-items: center; justify-content: center; padding: 16px; }
  .modal-overlay.open { display: flex; }
  .modal {
    background: var(--card);
    border-radius: 18px;
    padding: 24px;
    width: 100%;
    max-width: 460px;
    box-shadow: 0 24px 64px rgba(0,0,0,.2);
    display: flex;
    flex-direction: column;
    gap: 20px;
    max-height: 88vh;
    overflow-y: auto;
    border: 1px solid var(--border);
  }
  .modal-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .modal-head h2 { font-size: 17px; font-weight: 700; color: var(--fg); }
  .modal-close {
    width: 30px; height: 30px;
    border: none;
    background: var(--bg);
    border-radius: 8px;
    cursor: pointer;
    font-size: 16px;
    display: flex; align-items: center; justify-content: center;
    color: var(--muted);
    transition: background .15s, color .15s;
  }
  .modal-close:hover { color: var(--fg); }
  .feed-form { display: flex; flex-direction: column; gap: 12px; }
  .form-row { display: flex; flex-direction: column; gap: 5px; }
  .form-row label { font-size: 11.5px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; }
  .form-row input {
    width: 100%;
    padding: 9px 12px;
    border: 1.5px solid var(--border);
    border-radius: 10px;
    font-family: inherit;
    font-size: 14px;
    color: var(--fg);
    background: var(--bg);
    outline: none;
    transition: border-color .15s, box-shadow .15s;
  }
  .form-row input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(99,102,241,.12); }
  .form-row input::placeholder { color: var(--muted); }
  .feed-error { font-size: 13px; color: #dc2626; background: rgba(220,38,38,.06); border: 1px solid rgba(220,38,38,.15); border-radius: 8px; padding: 8px 12px; }
  .btn-submit {
    padding: 9px 18px;
    background: var(--accent);
    color: #fff;
    font-family: inherit;
    font-size: 13px;
    font-weight: 600;
    border: none;
    border-radius: 9px;
    cursor: pointer;
    transition: background .15s, opacity .15s;
    align-self: flex-end;
  }
  .btn-submit:hover { background: #4f46e5; }
  .btn-submit:disabled { opacity: .6; cursor: not-allowed; }
  .modal-divider { height: 1px; background: var(--border); }
  .modal-section-label { font-size: 11.5px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; }
  .feed-list { display: flex; flex-direction: column; gap: 8px; }
  .no-feeds { font-size: 13px; color: var(--muted); text-align: center; padding: 8px 0; }
  .feed-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 10px;
  }
  .feed-item-info { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
  .feed-item-name { font-size: 13px; font-weight: 600; color: var(--fg); }
  .feed-item-url { font-size: 11px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .btn-remove-feed {
    flex-shrink: 0;
    padding: 4px 10px;
    background: rgba(220,38,38,.07);
    color: #dc2626;
    border: 1px solid rgba(220,38,38,.2);
    border-radius: 6px;
    font-family: inherit;
    font-size: 11.5px;
    font-weight: 600;
    cursor: pointer;
    transition: background .15s;
  }
  .btn-remove-feed:hover { background: rgba(220,38,38,.15); }

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
        <button class="btn-add-feed" id="btn-open-feed-modal">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Feed
        </button>
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


<!-- Add-feed modal -->
<div class="modal-overlay" id="feed-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="feed-modal-title">
  <div class="modal">
    <div class="modal-head">
      <h2 id="feed-modal-title">Add RSS Feed</h2>
      <button class="modal-close" id="feed-modal-close" aria-label="Close">✕</button>
    </div>
    <form class="feed-form" id="feed-form" novalidate>
      <div class="form-row">
        <label for="feed-name">Feed name</label>
        <input id="feed-name" type="text" placeholder="e.g. Guardian World" required autocomplete="off"/>
      </div>
      <div class="form-row">
        <label for="feed-url">RSS / Atom URL</label>
        <input id="feed-url" type="url" placeholder="https://example.com/feed.xml" required autocomplete="off"/>
      </div>
      <p class="feed-error" id="feed-error" hidden></p>
      <button type="submit" class="btn-submit">Add Feed</button>
    </form>
    <div class="modal-divider"></div>
    <span class="modal-section-label">Saved custom feeds</span>
    <div class="feed-list" id="feed-list"></div>
  </div>
</div>

<script>
(function () {
  // ── Tab filtering ──────────────────────────────────
  function allCards() { return document.querySelectorAll('.card[data-cat]'); }

  let activeTab = 'all';

  function updateTabCounts() {
    const tabs = document.querySelectorAll('[data-tab]');
    const counts = { all: 0 };
    allCards().forEach(c => {
      if (c.style.display === 'none' && c.dataset.custom) return; // skip hidden custom cards not matching active tab
      counts.all++;
      const cat = c.dataset.cat;
      counts[cat] = (counts[cat] || 0) + 1;
    });
    // Recount properly (ignore display for counting purposes)
    const realCounts = { all: 0 };
    allCards().forEach(c => {
      realCounts.all++;
      const cat = c.dataset.cat;
      realCounts[cat] = (realCounts[cat] || 0) + 1;
    });
    tabs.forEach(tab => {
      const cat = tab.dataset.tab;
      tab.querySelector('.tab-count').textContent = realCounts[cat] || 0;
    });
  }

  function applyFilter() {
    allCards().forEach(c => {
      c.style.display = (activeTab === 'all' || c.dataset.cat === activeTab) ? '' : 'none';
    });
  }

  function initTabs() {
    const tabs = document.querySelectorAll('[data-tab]');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        activeTab = tab.dataset.tab;
        tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === activeTab));
        applyFilter();
      });
    });
    updateTabCounts();
  }

  // ── Custom RSS feeds ───────────────────────────────
  const FEEDS_KEY = 'my-news-custom-feeds';

  function getSavedFeeds() {
    try { return JSON.parse(localStorage.getItem(FEEDS_KEY) || '[]'); }
    catch { return []; }
  }
  function setSavedFeeds(feeds) { localStorage.setItem(FEEDS_KEY, JSON.stringify(feeds)); }

  function categorizeClient(text) {
    const t = text.toLowerCase();
    const rules = [
      [/\\b(canada|canadian|ontario|quebec|toronto|vancouver|montreal|calgary|edmonton|ottawa|winnipeg|trudeau|rcmp|cbc)\\b/, 'canada'],
      [/\\b(war|conflict|ukraine|russia|china|israel|gaza|iran|nato|united nations|election|president|prime minister|military|troops)\\b/, 'world'],
      [/\\b(india|indian|modi|delhi|mumbai|bangalore|bengaluru|chennai|kolkata|hyderabad|bjp|rupee|isro)\\b/, 'india'],
      [/\\b(stocks?|economy|gdp|inflation|interest rate|ipo|earnings|profit|crypto|bitcoin|nasdaq|financial|wall street)\\b/, 'business'],
      [/\\b(health|medical|vaccine|cancer|disease|treatment|covid|climate|space|nasa|research|scientists?|biology|physics)\\b/, 'science'],
      [/\\b(ai\\b|artificial intelligence|software|iphone|android|google|apple|microsoft|amazon|chip|startup|cybersecurity|openai|chatgpt)\\b/, 'tech'],
    ];
    for (const [re, key] of rules) if (re.test(t)) return key;
    return 'other';
  }

  function parseRSS(xml) {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    const nodes = [...doc.querySelectorAll('item, entry')].slice(0, 15);
    return nodes.map(el => {
      const g = tag => el.querySelector(tag)?.textContent?.trim() || '';
      const link = el.querySelector('link')?.getAttribute('href') || g('link');
      return { title: g('title'), link, desc: g('description') || g('summary'), pubDate: g('pubDate') || g('published') };
    });
  }

  function makeCustomCard(item, sourceName) {
    const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const title = esc(item.title || '(untitled)');
    const link = item.link || '#';
    const raw = (item.desc || '').replace(/<[^>]*>/g, '').slice(0, 280);
    const desc = esc(raw);
    const cat = categorizeClient(item.title + ' ' + raw);
    const ts = item.pubDate ? new Date(item.pubDate).toLocaleDateString(undefined, {month:'short',day:'numeric'}) : '';
    const slug = sourceName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const hidden = (activeTab !== 'all' && cat !== activeTab) ? ' style="display:none"' : '';
    return \`<article class="card" data-cat="\${cat}" data-custom="1"\${hidden}>
    <div class="card-top">
      <span class="source-badge src-\${slug} src-custom-feed">\${esc(sourceName)}</span>
      <time class="card-time">\${ts}</time>
    </div>
    <h3><a href="\${link}" target="_blank" rel="noopener">\${title}</a></h3>
    \${desc ? \`<p class="desc">\${desc}</p>\` : ''}
  </article>\`;
  }

  async function fetchFeed(url) {
    const proxy = 'https://api.allorigins.win/get?url=' + encodeURIComponent(url);
    const res = await fetch(proxy);
    if (!res.ok) throw new Error('Network error (' + res.status + ')');
    const { contents } = await res.json();
    if (!contents) throw new Error('Empty response from proxy');
    return parseRSS(contents);
  }

  async function renderCustomFeeds() {
    const feeds = getSavedFeeds();
    if (!feeds.length) return;
    const grid = document.getElementById('main-grid');
    await Promise.allSettled(feeds.map(async feed => {
      try {
        const items = await fetchFeed(feed.url);
        const html = items.map(it => makeCustomCard(it, feed.name)).join('');
        grid.insertAdjacentHTML('afterbegin', html);
      } catch (e) {
        console.warn('Custom feed failed:', feed.name, e.message);
      }
    }));
    updateTabCounts();
  }

  // ── Feed modal ─────────────────────────────────────
  function initFeedModal() {
    const overlay  = document.getElementById('feed-modal-overlay');
    const openBtn  = document.getElementById('btn-open-feed-modal');
    const closeBtn = document.getElementById('feed-modal-close');
    const form     = document.getElementById('feed-form');
    const nameIn   = document.getElementById('feed-name');
    const urlIn    = document.getElementById('feed-url');
    const errorEl  = document.getElementById('feed-error');
    const listEl   = document.getElementById('feed-list');
    const submitBtn = form.querySelector('[type="submit"]');

    const openModal  = () => { renderList(); overlay.classList.add('open'); nameIn.focus(); };
    const closeModal = () => { overlay.classList.remove('open'); form.reset(); errorEl.hidden = true; };

    openBtn.addEventListener('click', openModal);
    closeBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && overlay.classList.contains('open')) closeModal(); });

    function renderList() {
      const feeds = getSavedFeeds();
      listEl.innerHTML = feeds.length
        ? feeds.map((f, i) => \`<div class="feed-item">
            <div class="feed-item-info">
              <span class="feed-item-name">\${f.name.replace(/</g,'&lt;')}</span>
              <span class="feed-item-url">\${f.url.replace(/</g,'&lt;')}</span>
            </div>
            <button class="btn-remove-feed" data-idx="\${i}">Remove</button>
          </div>\`).join('')
        : '<p class="no-feeds">No custom feeds yet.</p>';
    }

    listEl.addEventListener('click', e => {
      const btn = e.target.closest('.btn-remove-feed');
      if (!btn) return;
      const i = Number(btn.dataset.idx);
      const feeds = getSavedFeeds();
      const removed = feeds.splice(i, 1)[0];
      setSavedFeeds(feeds);
      // Remove cards from that source
      document.querySelectorAll('.card[data-custom="1"]').forEach(c => {
        if (c.querySelector('.source-badge')?.textContent.trim() === removed.name) c.remove();
      });
      updateTabCounts();
      renderList();
    });

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const name = nameIn.value.trim();
      const url  = urlIn.value.trim();
      if (!name || !url) return;
      errorEl.hidden = true;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Adding…';
      try {
        const items = await fetchFeed(url);
        if (!items.length) throw new Error('No articles found in this feed.');
        const feeds = getSavedFeeds();
        feeds.push({ name, url });
        setSavedFeeds(feeds);
        const grid = document.getElementById('main-grid');
        grid.insertAdjacentHTML('afterbegin', items.map(it => makeCustomCard(it, name)).join(''));
        updateTabCounts();
        form.reset();
        renderList();
      } catch (err) {
        errorEl.textContent = 'Failed to load feed: ' + err.message;
        errorEl.hidden = false;
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Add Feed';
      }
    });
  }

  initTabs();
  initFeedModal();
  renderCustomFeeds();
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