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

const LIST_URL = "https://letterboxd.com/official/list/letterboxds-top-500-films/";
const FILMS_PER_PAGE = 100;
const TOTAL_PAGES = 5;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

let cache = null; // { movies, refreshedAt, expires }

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchPage(pageNum) {
  const url = pageNum > 1 ? `${LIST_URL}page/${pageNum}/` : LIST_URL;
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9"
    },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) {
    const err = new Error(`Letterboxd returned HTTP ${response.status} on page ${pageNum}`);
    err.status = response.status;
    throw err;
  }
  return response.text();
}

function parsePage(html, pageNum, movies, seen) {
  const $ = cheerio.load(html);

  // Supports both the older (li.poster-container) and newer (li.posteritem / li.griditem) markup.
  $("li.poster-container, li.posteritem, li.griditem").each((i, element) => {
    const node = $(element);
    const comp = node
      .find("[data-item-link], [data-target-link], [data-film-slug]")
      .first();

    const slug = comp.attr("data-film-slug") || comp.attr("data-item-slug") || "";
    let href =
      comp.attr("data-item-link") ||
      comp.attr("data-target-link") ||
      node.find("a[href*='/film/']").first().attr("href") ||
      (slug ? `/film/${slug}/` : "");
    if (!href) return;
    if (!href.startsWith("/")) href = `/${href}`;

    const rawName =
      comp.attr("data-item-name") ||
      comp.attr("data-film-name") ||
      node.find("img").attr("alt")?.trim() ||
      node.find("a").attr("title")?.trim() ||
      "";

    // Newer markup uses names like "Parasite (2019)"; split off the year if present.
    let title = rawName.trim();
    let year = comp.attr("data-film-release-year") || "";
    const match = title.match(/^(.*)\s+\((\d{4})\)$/);
    if (match) {
      title = match[1].trim();
      year = year || match[2];
    }

    if (!title || seen.has(href)) return;
    seen.add(href);

    const img = node.find("img").first();
    let poster =
      img.attr("data-src") || img.attr("data-original") || img.attr("src") || "";
    if (poster.startsWith("//")) poster = `https:${poster}`;
    if (poster.includes("empty-poster")) poster = "";

    const rankText = node.find(".list-number, .film-number").first().text().trim();
    const rank =
      Number.parseInt(rankText, 10) || (pageNum - 1) * FILMS_PER_PAGE + i + 1;

    movies.push({
      id: href.replace(/^\/|\/$/g, ""),
      title,
      year,
      rank,
      poster,
      letterboxdUrl: `https://letterboxd.com${href}`
    });
  });
}

async function scrapeTop500() {
  const movies = [];
  const seen = new Set();

  for (let page = 1; page <= TOTAL_PAGES; page++) {
    const html = await fetchPage(page);
    const before = movies.length;
    parsePage(html, page, movies, seen);
    if (movies.length === before) break; // no more films found; stop early
    if (page < TOTAL_PAGES) await sleep(600); // be polite
  }

  movies.sort((a, b) => a.rank - b.rank);
  return movies;
}

// Scrapes the public official list pages. This is an unofficial convenience integration;
// Letterboxd can change markup or restrict requests at any time.
app.get("/api/letterboxd/top500", async (req, res) => {
  const force = req.query.refresh === "1";

  if (!force && cache && cache.expires > Date.now()) {
    return res.json({
      movies: cache.movies,
      source: LIST_URL,
      refreshedAt: cache.refreshedAt,
      cached: true
    });
  }

  try {
    const movies = await scrapeTop500();

    if (!movies.length) {
      return res.status(502).json({
        error:
          "Could not read the list markup. Letterboxd may have changed its page. Use Import CSV instead."
      });
    }

    cache = {
      movies,
      refreshedAt: new Date().toISOString(),
      expires: Date.now() + CACHE_TTL_MS
    };

    res.json({
      movies,
      source: LIST_URL,
      refreshedAt: cache.refreshedAt,
      cached: false
    });
  } catch (error) {
    // Serve stale data if we have it rather than failing outright.
    if (cache) {
      return res.json({
        movies: cache.movies,
        source: LIST_URL,
        refreshedAt: cache.refreshedAt,
        cached: true,
        stale: true
      });
    }
    res.status(502).json({
      error: `Could not sync with Letterboxd: ${error.message}. Import a CSV list as a fallback.`
    });
  }
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Serve the production build when present (works on Express 4 and 5).
const dist = path.resolve(__dirname, "../dist");
app.use(express.static(dist));
app.use((req, res, next) => {
  if (req.method !== "GET" || req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(dist, "index.html"), (err) => err && next(err));
});

// Vercel runs the exported app as a serverless function, so only listen locally.
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Frame Roulette server listening at http://localhost:${PORT}`);
  });
}

export default app;
