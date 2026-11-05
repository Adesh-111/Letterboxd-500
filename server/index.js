import express from "express";
import cors from "cors";
import * as cheerio from "cheerio";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 8787;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// Scrapes the public official list page. This is an unofficial convenience integration;
// Letterboxd can change markup or restrict requests at any time.
app.get("/api/letterboxd/top500", async (_req, res) => {
  const pageUrl = "https://letterboxd.com/official/list/letterboxds-top-500-films/";
  try {
    const response = await fetch(pageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; FrameRoulette/1.0; personal movie selector)",
        "Accept": "text/html"
      }
    });
    if (!response.ok) {
      return res.status(response.status).json({
        error: `Letterboxd returned HTTP ${response.status}. Import a CSV list as a fallback.`
      });
    }
    const html = await response.text();
    const $ = cheerio.load(html);
    const movies = [];
    const seen = new Set();

    $("li.poster-container").each((_i, element) => {
      const node = $(element);
      const anchor = node.find("div[data-film-slug] a[href*='/film/']").first();
      const slug = node.find("[data-film-slug]").attr("data-film-slug") || "";
      const href = anchor.attr("href") || (slug ? `/film/${slug}/` : "");
      const title = node.find("img").attr("alt")?.trim()
        || node.find("[data-film-name]").attr("data-film-name")?.trim()
        || node.find("a").attr("title")?.trim();
      const img = node.find("img").attr("src")
        || node.find("img").attr("data-src")
        || node.find("img").attr("data-original");
      const rankText = node.find(".list-number, .film-number").first().text().trim();
      const rank = Number.parseInt(rankText, 10) || movies.length + 1;
      if (!title || !href || seen.has(href)) return;
      seen.add(href);
      movies.push({
        id: href.replace(/^\/|\/$/g, ""),
        title,
        year: "",
        rank,
        poster: img ? img.replace(/^\/\//, "https://") : "",
        letterboxdUrl: `https://letterboxd.com${href.startsWith("/") ? href : `/${href}`}`
      });
    });

    if (!movies.length) {
      return res.status(502).json({
        error: "Could not read the list markup. Letterboxd may have changed its page. Use Import CSV instead."
      });
    }
    res.json({ movies, source: pageUrl, refreshedAt: new Date().toISOString() });
  } catch (error) {
    res.status(502).json({
      error: `Could not sync with Letterboxd: ${error.message}. Import a CSV list as a fallback.`
    });
  }
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Serve the production build when present.
const dist = path.resolve(__dirname, "../dist");
app.use(express.static(dist));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(dist, "index.html"), (err) => err && next(err));
});

app.listen(PORT, () => {
  console.log(`Frame Roulette server listening at http://localhost:${PORT}`);
});
