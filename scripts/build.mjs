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

const itemToCard = (it, sourceName) => {
  const title = it.title || "(untitled)";
  const link = it.link || "#";
  const desc = safe(it.contentSnippet || it.content || "");
  const ts = humanTime(it.isoDate || it.pubDate);
  return `
  <article class="card">
    <h3><a href="${link}" target="_blank" rel="noopener">${title}</a></h3>
    <div class="meta">
      <span>${sourceName}</span>
      <span>•</span>
      <time>${ts}</time>
    </div>
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
<style>
  :root { --bg:#0b0f14; --fg:#e8eef5; --muted:#9fb3c8; --card:#121821; --accent:#7cc4ff; }
  *{box-sizing:border-box}
  body{margin:0; font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial; background:var(--bg); color:var(--fg);}
  header{padding:24px 16px; border-bottom:1px solid #1f2937;}
  .wrap{max-width:1024px; margin:0 auto; padding:0 16px;}
  h1{margin:0 0 8px; font-size:28px}
  .meta-line{color:var(--muted); font-size:14px}
  .grid{display:grid; grid-template-columns:repeat(auto-fill,minmax(320px,1fr)); gap:16px; padding:24px 0 64px;}
  .card{background:var(--card); border:1px solid #1f2937; padding:16px; border-radius:16px; box-shadow:0 2px 12px rgba(0,0,0,.2);}
  .card h3{margin:0 0 6px; font-size:18px; line-height:1.3}
  .card a{color:var(--fg); text-decoration:none}
  .card a:hover{color:var(--accent)}
  .card .meta{display:flex; gap:8px; color:var(--muted); font-size:12px; margin:0 0 8px;}
  .desc{margin:8px 0 0; color:#cfe2f3; font-size:14px; line-height:1.45}
  footer{border-top:1px solid #1f2937; color:var(--muted); font-size:13px; padding:16px 0 48px;}
  .sources{display:flex; flex-wrap:wrap; gap:8px; margin-top:6px}
  .pill{padding:4px 8px; border:1px solid #263445; border-radius:999px; color:#a5b4c3; font-size:12px}
</style>
</head>
<body>
  <header>
    <div class="wrap">
      <h1>My News</h1>
      <div class="meta-line">Updated ${updatedAt}</div>
      <div class="sources">${sourcesList}</div>
    </div>
  </header>
  <main class="wrap">
    <section class="grid">
      ${cardsHTML}
    </section>
  </main>
  <footer>
    <div class="wrap">
      Built with GitHub Pages & GitHub Actions • No cookies • Links go to original publishers.
    </div>
  </footer>
</body>
</html>`;

const sourcePill = (name) => `<span class="pill">${name}</span>`;

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