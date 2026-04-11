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
  customFields: { item: ["category", "categories", ["media:content", "mediaContent"], ["media:thumbnail", "mediaThumbnail"]] }
});

const extractImage = (it) => {
  const url =
    it.mediaContent?.$?.url ||
    it.mediaThumbnail?.$?.url ||
    it.enclosure?.url ||
    null;
  if (!url || !/^https?:\/\//i.test(url)) return null;
  return url;
};

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
const TECH_SOURCES   = new Set(["the verge", "hacker news", "techcrunch", "zdnet", "engadget", "wired", "ars technica", "the register"]);
const CANADA_SOURCES = new Set(["cbc top stories", "cbc canada"]);
const INDIA_SOURCES  = new Set(["ndtv", "the hindu", "indian express", "times of india"]);
const SCIENCE_SOURCES = new Set(["nasa", "science daily"]);

const SOURCE_DOMAINS = {
  "BBC World": "bbc.co.uk", "BBC Sport": "bbc.co.uk",
  "Associated Press": "apnews.com", "NPR News": "npr.org",
  "The Guardian": "theguardian.com", "Al Jazeera": "aljazeera.com",
  "CBC Top Stories": "cbc.ca", "CBC Canada": "cbc.ca",
  "The Verge": "theverge.com", "Hacker News": "ycombinator.com",
  "TechCrunch": "techcrunch.com", "Ars Technica": "arstechnica.com",
  "The Register": "theregister.com", "Wired": "wired.com",
  "Yahoo Finance": "yahoo.com", "Investopedia": "investopedia.com",
  "NASA": "nasa.gov", "Science Daily": "sciencedaily.com",
  "NDTV": "ndtv.com", "Times of India": "timesofindia.com",
  "Indian Express": "indianexpress.com",
};

const CAT_LABEL = { canada:"Canada", world:"World", india:"India", tech:"Tech", business:"Business", science:"Science", other:"Other" };

const categorize = (title, desc, sourceName) => {
  const text = (title + " " + (desc || "")).toLowerCase();
  for (const { key, re } of CATEGORY_RULES) {
    if (re.test(text)) return key;
  }
  if (CANADA_SOURCES.has(sourceName.toLowerCase())) return "canada";
  if (INDIA_SOURCES.has(sourceName.toLowerCase())) return "india";
  if (TECH_SOURCES.has(sourceName.toLowerCase())) return "tech";
  if (SCIENCE_SOURCES.has(sourceName.toLowerCase())) return "science";
  return "other";
};

const itemToCard = (it, sourceName) => {
  const title = it.title || "(untitled)";
  const link = it.link || "#";
  const desc = safe(it.contentSnippet || it.content || "");
  const ts = humanTime(it.isoDate || it.pubDate);
  const cat = categorize(title, desc, sourceName);
  const img = extractImage(it);
  const domain = SOURCE_DOMAINS[sourceName] || "";
  const label = CAT_LABEL[cat] || cat;
  return `
  <article class="card${img ? "" : " card--no-img"}" data-cat="${cat}">
    <div class="card-media">
      ${img ? `<img class="card-img" src="${img}" alt="" loading="lazy" onerror="this.remove()"/>` : ""}
      <span class="cat-chip">${label}</span>
    </div>
    <div class="card-body">
      <h3><a href="${link}" target="_blank" rel="noopener">${title}</a></h3>
      ${desc ? `<p class="desc">${desc}</p>` : ""}
      <div class="card-meta">
        ${domain ? `<img class="favicon" src="https://www.google.com/s2/favicons?domain=${domain}&sz=32" alt="" loading="lazy" onerror="this.remove()"/>` : ""}
        <span class="source-name">${sourceName}</span>
        <time class="card-time">${ts}</time>
      </div>
    </div>
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
  /* ── Variables ──────────────────────────────────── */
  :root {
    --bg: #f7f5f0;
    --card: #ffffff;
    --border: rgba(0,0,0,0.08);
    --fg: #111111;
    --muted: #666666;
    --accent: #e63946;
    --accent-dark: #c1121f;
    --desc: #444444;
    --shadow-sm: 0 1px 4px rgba(0,0,0,0.07), 0 0 1px rgba(0,0,0,0.05);
    --shadow-md: 0 8px 28px rgba(0,0,0,0.13), 0 2px 6px rgba(0,0,0,0.07);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #111111;
      --card: #1c1c1c;
      --border: rgba(255,255,255,0.09);
      --fg: #f0ede8;
      --muted: #888888;
      --desc: #aaaaaa;
      --shadow-sm: 0 1px 4px rgba(0,0,0,0.35);
      --shadow-md: 0 8px 28px rgba(0,0,0,0.5);
    }
  }

  /* ── Reset ───────────────────────────────────────── */
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
    background: #111111;
    border-bottom: 3px solid var(--accent);
  }
  .header-inner {
    max-width: 1280px;
    margin: 0 auto;
    padding: 0 24px;
    height: 58px;
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
    width: 32px; height: 32px;
    background: var(--accent);
    border-radius: 5px;
    display: flex; align-items: center; justify-content: center;
    font-size: 16px;
    flex-shrink: 0;
  }
  h1 {
    font-size: 20px;
    font-weight: 700;
    letter-spacing: -0.5px;
    color: #ffffff;
    font-family: Georgia, 'Times New Roman', serif;
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
    background: rgba(255,255,255,0.07);
    border: 1px solid rgba(255,255,255,0.13);
    border-radius: 999px;
    padding: 5px 12px;
    font-size: 11.5px;
    font-weight: 500;
    color: rgba(255,255,255,0.65);
    white-space: nowrap;
    flex-shrink: 0;
  }
  .updated-dot {
    width: 6px; height: 6px;
    background: #4ade80;
    border-radius: 50%;
    animation: pulse 2.5s ease-in-out infinite;
    flex-shrink: 0;
  }
  @keyframes pulse {
    0%,100% { opacity:1; transform:scale(1); }
    50% { opacity:.3; transform:scale(.65); }
  }
  .sources { display: none; }
  .pill {
    padding: 3px 9px;
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: 999px;
    color: rgba(255,255,255,0.55);
    font-size: 11px;
    font-weight: 500;
    background: rgba(255,255,255,0.06);
    white-space: nowrap;
  }

  /* ── Discover button ─────────────────────────────── */
  .btn-discover {
    padding: 8px 18px;
    background: var(--accent);
    color: #fff;
    font-family: inherit;
    font-size: 13px;
    font-weight: 600;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    transition: background .15s;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .btn-discover:hover { background: var(--accent-dark); }

  /* ── Main ────────────────────────────────────────── */
  main {
    max-width: 1280px;
    margin: 0 auto;
    padding: 28px 24px 80px;
  }

  /* ── Category tabs ───────────────────────────────── */
  .tabs {
    display: flex;
    gap: 2px;
    overflow-x: auto;
    padding: 0 0 0;
    margin-bottom: 24px;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
    border-bottom: 2px solid var(--border);
  }
  .tabs::-webkit-scrollbar { display: none; }
  .tab {
    flex-shrink: 0;
    padding: 10px 16px;
    min-height: 42px;
    border: none;
    border-bottom: 2px solid transparent;
    margin-bottom: -2px;
    border-radius: 0;
    background: transparent;
    color: var(--muted);
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all .15s ease;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
  }
  .tab:hover { color: var(--fg); }
  .tab.active { color: var(--accent); border-bottom-color: var(--accent); font-weight: 600; }
  .tab-count {
    font-size: 11px;
    padding: 1px 6px;
    border-radius: 999px;
    background: rgba(0,0,0,0.06);
    color: inherit;
  }
  @media (prefers-color-scheme: dark) {
    .tab-count { background: rgba(255,255,255,0.08); }
  }

  /* ── Grid ────────────────────────────────────────── */
  .grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
  }
  /* Featured card: every 7th starting from 1st spans 2 columns */
  .card:nth-child(7n+1) { grid-column: span 2; }

  /* ── Card ────────────────────────────────────────── */
  .card {
    background: var(--card);
    border-radius: 6px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: var(--shadow-sm);
    border: 1px solid var(--border);
    transition: transform .2s ease, box-shadow .2s ease;
    position: relative;
    animation: fadeUp .3s ease both;
  }
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .card:hover {
    transform: translateY(-3px);
    box-shadow: var(--shadow-md);
  }

  /* ── Card media ──────────────────────────────────── */
  .card-media {
    position: relative;
    overflow: hidden;
    background: #e8e4dc;
    aspect-ratio: 16/9;
    flex-shrink: 0;
  }
  @media (prefers-color-scheme: dark) {
    .card-media { background: #2a2a2a; }
  }
  .card--no-img .card-media { display: none; }
  .card-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    transition: transform .45s ease;
  }
  .card:hover .card-img { transform: scale(1.05); }
  /* Featured card gets a wider image */
  .card:nth-child(7n+1) .card-media { aspect-ratio: 21/9; }

  /* ── Category chip ───────────────────────────────── */
  .cat-chip {
    position: absolute;
    top: 10px;
    left: 10px;
    background: var(--accent);
    color: #fff;
    font-size: 9.5px;
    font-weight: 700;
    letter-spacing: .07em;
    text-transform: uppercase;
    padding: 3px 8px;
    border-radius: 3px;
    pointer-events: none;
  }
  .card[data-cat="canada"]   .cat-chip { background: #c41e3a; }
  .card[data-cat="world"]    .cat-chip { background: #1d4ed8; }
  .card[data-cat="india"]    .cat-chip { background: #ea580c; }
  .card[data-cat="tech"]     .cat-chip { background: #7c3aed; }
  .card[data-cat="business"] .cat-chip { background: #059669; }
  .card[data-cat="science"]  .cat-chip { background: #0891b2; }
  .card[data-cat="other"]    .cat-chip { background: #64748b; }

  /* ── Card body ───────────────────────────────────── */
  .card-body {
    flex: 1;
    padding: 14px 16px 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .card h3 {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 16px;
    font-weight: 700;
    line-height: 1.4;
    letter-spacing: -0.15px;
  }
  /* Featured card gets larger headline */
  .card:nth-child(7n+1) h3 { font-size: 21px; }
  .card h3 a {
    color: var(--fg);
    text-decoration: none;
    transition: color .15s;
  }
  .card h3 a:hover { color: var(--accent); }
  /* Stretch link to cover whole card */
  .card h3 a::after {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 1;
  }
  .desc {
    font-size: 13.5px;
    line-height: 1.6;
    color: var(--desc);
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  /* ── Card meta ───────────────────────────────────── */
  .card-meta {
    margin-top: auto;
    padding-top: 10px;
    display: flex;
    align-items: center;
    gap: 6px;
    border-top: 1px solid var(--border);
  }
  .favicon {
    width: 15px; height: 15px;
    border-radius: 2px;
    flex-shrink: 0;
  }
  .source-name {
    font-size: 11.5px;
    font-weight: 600;
    color: var(--muted);
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .card-time {
    font-size: 11px;
    color: var(--muted);
    white-space: nowrap;
    flex-shrink: 0;
  }

  /* ── Loading placeholder ─────────────────────────── */
  .custom-loading {
    grid-column: 1/-1;
    text-align: center;
    color: var(--muted);
    padding: 24px;
  }

  /* ── Footer ──────────────────────────────────────── */
  footer {
    border-top: 1px solid var(--border);
    padding: 24px;
    text-align: center;
    font-size: 12px;
    color: var(--muted);
  }
  footer a { color: var(--muted); text-decoration: none; }
  footer a:hover { color: var(--accent); }

  /* ── Modal overlay ───────────────────────────────── */
  .modal-overlay {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.62);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    z-index: 100;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }
  .modal-overlay.open { display: flex; }
  .modal {
    background: var(--card);
    border-radius: 10px;
    padding: 24px;
    width: 100%;
    max-width: 480px;
    box-shadow: 0 24px 64px rgba(0,0,0,.28);
    display: flex;
    flex-direction: column;
    gap: 20px;
    max-height: 88vh;
    overflow-y: auto;
    border: 1px solid var(--border);
  }
  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .modal-header h2 {
    font-size: 17px;
    font-weight: 700;
    font-family: Georgia, serif;
  }
  .modal-close {
    width: 30px; height: 30px;
    border: none;
    background: var(--bg);
    border-radius: 6px;
    cursor: pointer;
    font-size: 16px;
    display: flex; align-items: center; justify-content: center;
    color: var(--muted);
    transition: background .15s, color .15s;
  }
  .modal-close:hover { background: var(--accent); color: #fff; }

  /* ── Modal tabs ──────────────────────────────────── */
  .modal-tabs {
    display: flex;
    border-bottom: 2px solid var(--border);
    margin: -8px 0 0;
  }
  .modal-tab-btn {
    flex: 1;
    padding: 10px 6px;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    margin-bottom: -2px;
    font-family: inherit;
    font-size: 13px;
    font-weight: 600;
    color: var(--muted);
    cursor: pointer;
    transition: color .15s, border-color .15s;
  }
  .modal-tab-btn.active { color: var(--accent); border-bottom-color: var(--accent); }
  .modal-tab-panel { display: none; padding-top: 8px; flex-direction: column; gap: 14px; }
  .modal-tab-panel.active { display: flex; }

  /* ── Category filter chips (modal) ──────────────── */
  .cat-filter-btns { display: flex; flex-wrap: wrap; gap: 6px; }
  .cat-filter-btn {
    padding: 4px 12px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: transparent;
    color: var(--muted);
    font-family: inherit;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all .15s;
  }
  .cat-filter-btn:hover { border-color: var(--fg); color: var(--fg); }
  .cat-filter-btn.active { background: var(--fg); border-color: var(--fg); color: #ffffff; }
  @media (prefers-color-scheme: dark) {
    .cat-filter-btn.active { color: #111111; }
  }

  /* ── Suggested feed list ─────────────────────────── */
  .suggest-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 320px;
    overflow-y: auto;
  }
  .suggest-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 7px;
  }
  .suggest-info { display: flex; flex-direction: column; gap: 3px; flex: 1; overflow: hidden; }
  .suggest-name { font-size: 13px; font-weight: 600; color: var(--fg); }
  .suggest-desc { font-size: 11px; color: var(--muted); }
  .cat-badge {
    display: inline-block;
    font-size: 9.5px;
    font-weight: 700;
    padding: 2px 7px;
    border-radius: 3px;
    text-transform: uppercase;
    letter-spacing: .05em;
    margin-top: 3px;
    width: fit-content;
    color: #fff;
  }
  .cat-world    { background: #1d4ed8; }
  .cat-tech     { background: #7c3aed; }
  .cat-science  { background: #0891b2; }
  .cat-business { background: #059669; }
  .cat-india    { background: #ea580c; }
  .cat-other    { background: #64748b; }
  .btn-add-feed {
    flex-shrink: 0;
    padding: 6px 14px;
    background: var(--accent);
    color: #fff;
    border: none;
    border-radius: 5px;
    font-family: inherit;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: background .15s;
    white-space: nowrap;
  }
  .btn-add-feed:hover { background: var(--accent-dark); }
  .btn-add-feed.btn-added {
    background: rgba(5,150,105,.08);
    color: #059669;
    border: 1px solid rgba(5,150,105,.25);
    cursor: default;
  }

  /* ── Custom feed form ────────────────────────────── */
  .add-form { display: flex; flex-direction: column; gap: 14px; }
  .form-field { display: flex; flex-direction: column; gap: 6px; }
  .form-field label { font-size: 13px; font-weight: 600; }
  .form-field input {
    padding: 9px 12px;
    border: 1.5px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--fg);
    font-family: inherit;
    font-size: 13.5px;
    outline: none;
    transition: border-color .15s;
  }
  .form-field input:focus { border-color: var(--accent); }
  .form-error {
    font-size: 12.5px;
    color: var(--accent);
    padding: 8px 12px;
    background: rgba(230,57,70,.06);
    border: 1px solid rgba(230,57,70,.2);
    border-radius: 6px;
  }
  .form-actions { display: flex; justify-content: flex-end; }
  .btn-primary {
    padding: 9px 20px;
    background: var(--accent);
    color: #fff;
    border: none;
    border-radius: 5px;
    font-family: inherit;
    font-size: 13.5px;
    font-weight: 600;
    cursor: pointer;
    transition: background .15s;
  }
  .btn-primary:hover { background: var(--accent-dark); }

  /* ── Manage feeds list ───────────────────────────── */
  .sources-list { display: flex; flex-direction: column; gap: 8px; }
  .src-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 7px;
  }
  .src-item-info { display: flex; flex-direction: column; gap: 2px; flex: 1; overflow: hidden; }
  .src-item-name { font-size: 13px; font-weight: 600; }
  .src-item-url { font-size: 11px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .btn-remove {
    flex-shrink: 0;
    padding: 5px 12px;
    background: transparent;
    color: var(--accent);
    border: 1px solid rgba(230,57,70,.3);
    border-radius: 5px;
    font-family: inherit;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all .15s;
  }
  .btn-remove:hover { background: var(--accent); color: #fff; border-color: var(--accent); }
  .no-sources { font-size: 13px; color: var(--muted); text-align: center; padding: 20px 0; }

  /* ── Responsive – tablet ─────────────────────────── */
  @media (max-width: 1024px) {
    .grid { grid-template-columns: repeat(2, 1fr); }
    .card:nth-child(7n+1) { grid-column: span 2; }
  }

  /* ── Responsive – mobile ─────────────────────────── */
  @media (max-width: 640px) {
    .header-inner { padding: 0 14px; }
    h1 { font-size: 17px; }
    .brand-icon { width: 28px; height: 28px; font-size: 14px; }
    .updated-badge { display: none; }
    main { padding: 16px 12px 60px; }
    .grid { grid-template-columns: 1fr; gap: 12px; }
    .card:nth-child(7n+1) { grid-column: span 1; }
    .card:nth-child(7n+1) h3 { font-size: 17px; }
    .tabs { margin-bottom: 18px; }
    .tab { padding: 10px 12px; font-size: 12.5px; }
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
        <button class="btn-discover" id="open-feeds-modal">+ Discover Feeds</button>
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

  <div class="modal-overlay" id="feeds-modal">
    <div class="modal">
      <div class="modal-header">
        <h2>RSS Feed Sources</h2>
        <button class="modal-close" aria-label="Close">&#215;</button>
      </div>
      <div class="modal-tabs">
        <button class="modal-tab-btn active" data-panel="suggested">Suggested</button>
        <button class="modal-tab-btn" data-panel="custom">Add by URL</button>
        <button class="modal-tab-btn" data-panel="manage">Your Feeds</button>
      </div>
      <div class="modal-tab-panel active" id="panel-suggested">
        <div class="cat-filter-btns">
          <button class="cat-filter-btn active" data-cat="all">All</button>
          <button class="cat-filter-btn" data-cat="world">World</button>
          <button class="cat-filter-btn" data-cat="tech">Tech</button>
          <button class="cat-filter-btn" data-cat="science">Science</button>
          <button class="cat-filter-btn" data-cat="business">Business</button>
          <button class="cat-filter-btn" data-cat="india">India</button>
          <button class="cat-filter-btn" data-cat="other">Sports &amp; More</button>
        </div>
        <div class="suggest-list" id="suggested-feeds-list"></div>
      </div>
      <div class="modal-tab-panel" id="panel-custom">
        <form class="add-form" id="custom-feed-form">
          <div class="form-field">
            <label for="cf-name">Feed Name</label>
            <input id="cf-name" type="text" placeholder="e.g. My Favourite Blog" autocomplete="off"/>
          </div>
          <div class="form-field">
            <label for="cf-url">RSS / Atom URL</label>
            <input id="cf-url" type="url" placeholder="https://example.com/feed.xml" autocomplete="off"/>
          </div>
          <div class="form-error" id="cf-error" hidden></div>
          <div class="form-actions">
            <button type="submit" class="btn-primary">Add Feed</button>
          </div>
        </form>
      </div>
      <div class="modal-tab-panel" id="panel-manage">
        <div class="sources-list" id="custom-feeds-list"></div>
      </div>
    </div>
  </div>

  <footer>
    Built with <a href="https://pages.github.com" target="_blank" rel="noopener">GitHub Pages</a> &amp; GitHub Actions &nbsp;·&nbsp; No cookies &nbsp;·&nbsp; Links go to original publishers.
  </footer>


<script>
(function () {

  // ── Suggested feeds catalogue ──────────────────────
  var SUGGESTED = [
    {name:"Reuters Top News",      url:"https://feeds.reuters.com/reuters/topNews",                          cat:"world",    desc:"Top global stories from Reuters"},
    {name:"NPR News",              url:"https://feeds.npr.org/1001/rss.xml",                                 cat:"world",    desc:"National Public Radio – top headlines"},
    {name:"The Guardian World",    url:"https://www.theguardian.com/world/rss",                              cat:"world",    desc:"International news from The Guardian"},
    {name:"Al Jazeera English",    url:"https://www.aljazeera.com/xml/rss/all.xml",                          cat:"world",    desc:"Global news from Al Jazeera"},
    {name:"Associated Press",      url:"https://rsshub.app/apnews/topics/apf-topnews",                       cat:"world",    desc:"Breaking news from the AP wire"},
    {name:"MIT Technology Review", url:"https://www.technologyreview.com/feed/",                             cat:"tech",     desc:"Deep-dive tech journalism from MIT"},
    {name:"The Register",          url:"https://www.theregister.com/headlines.atom",                         cat:"tech",     desc:"Free enterprise & IT news"},
    {name:"The Register",          url:"https://www.theregister.com/headlines.atom",                         cat:"tech",     desc:"Enterprise and IT news"},
    {name:"Slashdot",              url:"https://rss.slashdot.org/Slashdot/slashdotMain",                     cat:"tech",     desc:"Tech news for nerds, stuff that matters"},
    {name:"9to5Mac",               url:"https://9to5mac.com/feed/",                                          cat:"tech",     desc:"Apple news and rumours"},
    {name:"Android Authority",     url:"https://www.androidauthority.com/feed/",                             cat:"tech",     desc:"Android news, reviews and guides"},
    {name:"NASA Breaking News",    url:"https://www.nasa.gov/news-release/feed/",                            cat:"science",  desc:"Latest news releases from NASA"},
    {name:"Science Daily",         url:"https://www.sciencedaily.com/rss/top/science.xml",                   cat:"science",  desc:"Latest research news across all sciences"},
    {name:"New Scientist",         url:"https://www.newscientist.com/feed/home/",                            cat:"science",  desc:"Science and technology news"},
    {name:"Scientific American",   url:"https://www.scientificamerican.com/platform/feeds/news.xml",         cat:"science",  desc:"In-depth science news and analysis"},
    {name:"Investopedia",           url:"https://www.investopedia.com/feedbuilder/feed/getfeed/?feedName=rss_headline", cat:"business", desc:"Free finance and investing news"},
    {name:"Yahoo Finance",         url:"https://finance.yahoo.com/news/rssindex",                            cat:"business", desc:"Free markets and finance news"},
    {name:"NDTV Top Stories",      url:"https://feeds.feedburner.com/ndtvnews-top-stories",                  cat:"india",    desc:"Top stories from NDTV India"},
    {name:"Times of India",        url:"https://timesofindia.indiatimes.com/rssfeedstopstories.cms",         cat:"india",    desc:"India's most-read English newspaper"},
    {name:"Times of India",        url:"https://timesofindia.indiatimes.com/rssfeedstopstories.cms",          cat:"india",    desc:"India's most-read free English newspaper"},
    {name:"BBC Sport",             url:"https://feeds.bbci.co.uk/sport/rss.xml",                             cat:"other",    desc:"Sports coverage from BBC"},
    {name:"ESPN Headlines",        url:"https://www.espn.com/espn/rss/news",                                 cat:"other",    desc:"Sports news from ESPN"},
    {name:"Lifehacker",            url:"https://lifehacker.com/feed/rss",                                    cat:"other",    desc:"Life hacks and productivity tips"},
    {name:"OpenCulture",           url:"https://www.openculture.com/feed",                                   cat:"other",    desc:"Free cultural & educational media"}
  ];

  // ── LocalStorage helpers ───────────────────────────
  var LS_KEY = 'myNewsCustomFeeds';
  function getCustomFeeds() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch(e) { return []; }
  }
  function setCustomFeeds(feeds) { localStorage.setItem(LS_KEY, JSON.stringify(feeds)); }
  function addCustomFeed(feed) {
    var feeds = getCustomFeeds();
    if (feeds.find(function(f) { return f.url === feed.url; })) return false;
    feeds.push(feed);
    setCustomFeeds(feeds);
    return true;
  }
  function removeCustomFeed(url) {
    setCustomFeeds(getCustomFeeds().filter(function(f) { return f.url !== url; }));
  }

  // ── Tab filtering ──────────────────────────────────
  function allCards() { return document.querySelectorAll('#main-grid .card[data-cat]'); }

  let activeTab = 'all';

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
      tab.querySelector('.tab-count').textContent = counts[cat] || 0;
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

  // ── Suggested feeds render ─────────────────────────
  function activeCatFilter() {
    var btn = document.querySelector('.cat-filter-btn.active');
    return btn ? btn.dataset.cat : 'all';
  }

  function renderSuggestedFeeds(filterCat) {
    var container = document.getElementById('suggested-feeds-list');
    var customUrls = getCustomFeeds().map(function(f) { return f.url; });
    var feeds = filterCat === 'all' ? SUGGESTED : SUGGESTED.filter(function(f) { return f.cat === filterCat; });
    if (!feeds.length) { container.innerHTML = '<p class="no-sources">No feeds in this category.</p>'; return; }
    container.innerHTML = feeds.map(function(feed) {
      var added = customUrls.indexOf(feed.url) !== -1;
      return '<div class="suggest-item">' +
        '<div class="suggest-info">' +
          '<span class="suggest-name">' + feed.name + '</span>' +
          '<span class="suggest-desc">' + feed.desc + '</span>' +
          '<span class="cat-badge cat-' + feed.cat + '">' + feed.cat + '</span>' +
        '</div>' +
        '<button class="btn-add-feed' + (added ? ' btn-added' : '') + '"' +
          ' data-url="' + feed.url + '" data-name="' + feed.name + '" data-cat="' + feed.cat + '">' +
          (added ? 'Added' : '+ Add') +
        '</button>' +
      '</div>';
    }).join('');
    container.querySelectorAll('.btn-add-feed:not(.btn-added)').forEach(function(btn) {
      btn.addEventListener('click', function() {
        addCustomFeed({name: btn.dataset.name, url: btn.dataset.url, cat: btn.dataset.cat});
        btn.textContent = 'Added';
        btn.classList.add('btn-added');
        btn.disabled = true;
        loadCustomFeeds();
        renderCustomFeedsList();
      });
    });
  }

  // ── Custom feeds list in modal ─────────────────────
  function renderCustomFeedsList() {
    var list = document.getElementById('custom-feeds-list');
    var feeds = getCustomFeeds();
    if (!feeds.length) {
      list.innerHTML = '<p class="no-sources">No custom feeds added yet. Browse the Suggested tab to add some!</p>';
      return;
    }
    list.innerHTML = feeds.map(function(feed) {
      return '<div class="src-item">' +
        '<div class="src-item-info">' +
          '<span class="src-item-name">' + feed.name + '</span>' +
          '<span class="src-item-url">' + feed.url + '</span>' +
        '</div>' +
        '<button class="btn-remove" data-url="' + feed.url + '" data-name="' + escapeHtml(feed.name) + '">Remove</button>' +
      '</div>';
    }).join('');
    list.querySelectorAll('.btn-remove').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var name = btn.dataset.name;
        removeCustomFeed(btn.dataset.url);
        document.querySelectorAll('#main-grid .card[data-feed="' + name.replace(/"/g, '\\"') + '"]').forEach(function(c) { c.remove(); });
        updateTabCounts();
        renderCustomFeedsList();
        renderSuggestedFeeds(activeCatFilter());
      });
    });
  }

  // ── Client-side RSS fetching ───────────────────────
  var PROXY = 'https://api.allorigins.win/raw?url=';

  function escapeHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function timeAgo(dateStr) {
    if (!dateStr) return '';
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    var s = (Date.now() - d.getTime()) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s/60) + 'm ago';
    if (s < 86400) return Math.floor(s/3600) + 'h ago';
    return Math.floor(s/86400) + 'd ago';
  }

  function catFromText(text) {
    var t = (text || '').toLowerCase();
    if (/\b(canada|canadian|toronto|vancouver|montreal|ottawa|cbc|trudeau)\b/.test(t)) return 'canada';
    if (/\b(india|indian|modi|delhi|mumbai|ndtv|rupee|isro)\b/.test(t)) return 'india';
    if (/\b(ai\b|artificial intelligence|software|iphone|android|google|apple|microsoft|openai|chatgpt|chip|startup|cybersecurity)\b/.test(t)) return 'tech';
    if (/\b(stocks?|economy|gdp|inflation|bitcoin|crypto|nasdaq|earnings|revenue|wall street|invest)\b/.test(t)) return 'business';
    if (/\b(health|medical|vaccine|covid|cancer|climate|space|nasa|science|research|biology|physics)\b/.test(t)) return 'science';
    if (/\b(war|conflict|ukraine|russia|china|israel|gaza|nato|election|military|president|minister)\b/.test(t)) return 'world';
    return 'other';
  }

  function parseRSSXML(xml) {
    var doc = (new DOMParser()).parseFromString(xml, 'application/xml');
    return Array.from(doc.querySelectorAll('item, entry')).slice(0, 10).map(function(el) {
      var title = (el.querySelector('title') || {}).textContent || '';
      var linkEl = el.querySelector('link');
      var link = (linkEl && (linkEl.getAttribute('href') || linkEl.textContent)) || '#';
      var rawDesc = (el.querySelector('description, summary, content') || {}).textContent || '';
      var desc = rawDesc.replace(/<[^>]*>/g, '').trim();
      var pubDate = (el.querySelector('pubDate, published, updated') || {}).textContent || '';
      // Image: media:content, media:thumbnail, enclosure, or first <img> in description
      var img = null;
      var mc = el.querySelector('content[url], content[medium="image"]');
      var mt = el.querySelector('thumbnail');
      var enc = el.querySelector('enclosure');
      var imgTag = rawDesc.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (mc) img = mc.getAttribute('url');
      else if (mt) img = mt.getAttribute('url');
      else if (enc && /image/i.test(enc.getAttribute('type') || '')) img = enc.getAttribute('url');
      else if (imgTag) img = imgTag[1];
      return { title: title.trim(), link: link.trim(), desc: desc, pubDate: pubDate.trim(), img: img };
    });
  }

  var CAT_LABELS = {canada:'Canada',world:'World',india:'India',tech:'Tech',business:'Business',science:'Science',other:'Other'};

  function makeCustomCard(item, feedName, feedCat) {
    var cat = catFromText(item.title + ' ' + item.desc) || feedCat || 'other';
    var validImg = item.img && /^https?:\/\//i.test(item.img);
    var catLabel = CAT_LABELS[cat] || cat;
    return '<article class="card' + (validImg ? '' : ' card--no-img') + '" data-cat="' + escapeHtml(cat) + '" data-feed="' + escapeHtml(feedName) + '">' +
      '<div class="card-media">' +
        (validImg ? '<img class="card-img" src="' + escapeHtml(item.img) + '" alt="" loading="lazy" onerror="this.remove()"/>' : '') +
        '<span class="cat-chip">' + escapeHtml(catLabel) + '</span>' +
      '</div>' +
      '<div class="card-body">' +
        '<h3><a href="' + escapeHtml(item.link) + '" target="_blank" rel="noopener">' + escapeHtml(item.title || '(untitled)') + '</a></h3>' +
        (item.desc ? '<p class="desc">' + escapeHtml(item.desc.substring(0, 250)) + '</p>' : '') +
        '<div class="card-meta">' +
          '<span class="source-name">' + escapeHtml(feedName) + '</span>' +
          '<time class="card-time">' + timeAgo(item.pubDate) + '</time>' +
        '</div>' +
      '</div>' +
    '</article>';
  }

  function loadCustomFeeds() {
    var feeds = getCustomFeeds();
    // Remove previously injected custom cards
    document.querySelectorAll('#main-grid .card[data-feed]').forEach(function(c) { c.remove(); });
    feeds.forEach(function(feed) {
      fetch(PROXY + encodeURIComponent(feed.url))
        .then(function(r) { return r.text(); })
        .then(function(xml) {
          var items = parseRSSXML(xml);
          var grid = document.getElementById('main-grid');
          items.reverse().forEach(function(item) {
            grid.insertAdjacentHTML('afterbegin', makeCustomCard(item, feed.name, feed.cat));
          });
          updateTabCounts();
          applyFilter();
        })
        .catch(function() {});
    });
  }

  // ── Modal ──────────────────────────────────────────
  function initModal() {
    var overlay = document.getElementById('feeds-modal');
    var openBtn = document.getElementById('open-feeds-modal');
    var closeBtn = overlay.querySelector('.modal-close');
    var tabBtns = overlay.querySelectorAll('.modal-tab-btn');
    var panels = {
      suggested: document.getElementById('panel-suggested'),
      custom:    document.getElementById('panel-custom'),
      manage:    document.getElementById('panel-manage')
    };

    function showPanel(name) {
      tabBtns.forEach(function(b) { b.classList.toggle('active', b.dataset.panel === name); });
      Object.keys(panels).forEach(function(k) { panels[k].classList.toggle('active', k === name); });
    }

    tabBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        showPanel(btn.dataset.panel);
        if (btn.dataset.panel === 'suggested') renderSuggestedFeeds(activeCatFilter());
        if (btn.dataset.panel === 'manage') renderCustomFeedsList();
      });
    });

    openBtn.addEventListener('click', function() {
      overlay.classList.add('open');
      showPanel('suggested');
      renderSuggestedFeeds('all');
    });
    closeBtn.addEventListener('click', function() { overlay.classList.remove('open'); });
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.classList.remove('open'); });
    document.addEventListener('keydown', function(e) { if (e.key === 'Escape') overlay.classList.remove('open'); });
  }

  // ── Category filter in modal ───────────────────────
  function initCategoryFilter() {
    document.querySelectorAll('.cat-filter-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.cat-filter-btn').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        renderSuggestedFeeds(btn.dataset.cat);
      });
    });
  }

  // ── Custom URL form ────────────────────────────────
  function initCustomForm() {
    var form    = document.getElementById('custom-feed-form');
    var nameEl  = document.getElementById('cf-name');
    var urlEl   = document.getElementById('cf-url');
    var errEl   = document.getElementById('cf-error');
    form.addEventListener('submit', function(e) {
      e.preventDefault();
      var name = nameEl.value.trim();
      var url  = urlEl.value.trim();
      errEl.hidden = true;
      if (!name || !url) { errEl.textContent = 'Please fill in both fields.'; errEl.hidden = false; return; }
      try { new URL(url); } catch(ex) { errEl.textContent = 'Please enter a valid URL.'; errEl.hidden = false; return; }
      if (!addCustomFeed({name:name, url:url, cat:'other'})) {
        errEl.textContent = 'This feed is already added.'; errEl.hidden = false; return;
      }
      nameEl.value = ''; urlEl.value = '';
      renderSuggestedFeeds(activeCatFilter());
      loadCustomFeeds();
    });
  }

  // ── Bootstrap ──────────────────────────────────────
  initTabs();
  initModal();
  initCategoryFilter();
  initCustomForm();
  loadCustomFeeds();

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