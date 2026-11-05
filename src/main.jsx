import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import Papa from "papaparse";
import {
  RefreshCw, Upload, RotateCcw, Film, ExternalLink, Check, X, Search, Shuffle, Sparkles
} from "lucide-react";
import "./styles.css";

const STORE_KEY = "frame-roulette-state-v1";
const POSTER_KEY = "frame-roulette-posters-v1";
const DEFAULT_SOURCE = "https://letterboxd.com/official/list/letterboxds-top-500-films/";
const SPIN_MS = 5200;
const PAGE_SIZE = 60;
const WHEEL_COLORS = ["#8c1d2c", "#1d4e5f", "#b8801f", "#4a2b66", "#1f6b4f", "#a14a1a"];

/* ---------------- storage + helpers ---------------- */

function safeLoad() {
  try {
    const value = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
    return {
      movies: Array.isArray(value.movies) ? value.movies : [],
      picked: Array.isArray(value.picked) ? value.picked : [],
      history: Array.isArray(value.history) ? value.history : [],
      source: value.source || "empty"
    };
  } catch {
    return { movies: [], picked: [], history: [], source: "empty" };
  }
}

function normalizeMovie(row, index) {
  const title = row.title || row.Name || row.Film || row["Film Name"] || row["Movie Title"];
  if (!title) return null;
  const year = row.year || row.Year || row["Release Year"] || "";
  const url = row.letterboxdUrl || row.URL || row["Letterboxd URI"] || row.uri || "";
  const poster = row.poster || row.Poster || row["Poster URL"] || "";
  return {
    id: row.id || url || `${String(title).toLowerCase().trim()}-${year}-${index}`,
    title: String(title).trim(),
    year: String(year).trim(),
    rank: Number(row.rank || row.Position || row.Rank || index + 1),
    poster: String(poster).trim(),
    letterboxdUrl: String(url).startsWith("http") ? String(url) : url ? `https://letterboxd.com${url}` : ""
  };
}

function sample(arr, n) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

/* ---------------- poster loading ---------------- */
// Posters scraped from Letterboxd are often empty, so missing ones are looked up through
// /api/poster (a few at a time) and remembered in localStorage.

function loadPosterCache() {
  try {
    return JSON.parse(localStorage.getItem(POSTER_KEY) || "{}");
  } catch {
    return {};
  }
}
const posterCache = loadPosterCache();
const inflight = new Map();
const queue = [];
let active = 0;

function pump() {
  while (active < 4 && queue.length) {
    const job = queue.shift();
    active++;
    job().finally(() => {
      active--;
      pump();
    });
  }
}

function requestPoster(movie) {
  if (movie.id in posterCache) return Promise.resolve(posterCache[movie.id]);
  if (inflight.has(movie.id)) return inflight.get(movie.id);
  const promise = new Promise((resolve) => {
    queue.push(async () => {
      try {
        const qs = new URLSearchParams({ title: movie.title, year: movie.year || "" });
        const response = await fetch(`/api/poster?${qs}`);
        const data = response.ok ? await response.json() : {};
        if (!data.error) {
          posterCache[movie.id] = data.poster || "";
          try {
            localStorage.setItem(POSTER_KEY, JSON.stringify(posterCache));
          } catch {}
        }
        resolve(data.poster || "");
      } catch {
        resolve("");
      }
    });
    pump();
  }).finally(() => inflight.delete(movie.id));
  inflight.set(movie.id, promise);
  return promise;
}

function usePoster(movie, ignoreOwn = false, enabled = true) {
  const own = !ignoreOwn && movie?.poster ? movie.poster : "";
  const [fetched, setFetched] = useState(() => (movie && posterCache[movie.id]) || "");
  useEffect(() => {
    if (!movie || !enabled || own) return;
    if (movie.id in posterCache) {
      setFetched(posterCache[movie.id]);
      return;
    }
    let alive = true;
    requestPoster(movie).then((url) => alive && setFetched(url));
    return () => {
      alive = false;
    };
  }, [movie?.id, enabled, own]);
  return own || fetched;
}

function Poster({ movie, eager = false, className = "" }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(eager);
  const [broken, setBroken] = useState(false);
  const [dead, setDead] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (visible) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "300px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  const src = usePoster(movie, broken, visible);

  return (
    <div ref={ref} className={`poster ${loaded ? "is-loaded" : ""} ${className}`}>
      <div className="poster-fallback">
        <Film size={26} />
        <span>{movie.title}</span>
      </div>
      {src && !dead && (
        <img
          key={src}
          src={src}
          alt={`${movie.title} poster`}
          referrerPolicy="no-referrer"
          loading={eager ? "eager" : "lazy"}
          onLoad={() => setLoaded(true)}
          onError={() => {
            if (!broken && movie.poster && src === movie.poster) {
              setBroken(true);
              setLoaded(false);
            } else {
              setDead(true);
            }
          }}
        />
      )}
    </div>
  );
}

/* ---------------- winner card ---------------- */

function WinnerCard({ winner, onRemove, onClear }) {
  const backdrop = usePoster(winner, false, true);
  return (
    <div className="winner-card" style={{ "--backdrop": backdrop ? `url("${backdrop}")` : "none" }}>
      <div className="winner-poster">
        <Poster key={winner.id} movie={winner} eager />
      </div>
      <div className="winner-meta">
        <span className="eyebrow"><Sparkles size={13} /> THE WHEEL HAS SPOKEN</span>
        <h2>{winner.title}</h2>
        <p>
          {winner.year || "Feature film"}
          {winner.rank ? ` · #${winner.rank} on the list` : ""}
        </p>
      </div>
      <div className="winner-buttons">
        <button className="primary-button" onClick={onRemove}>
          <Check size={16} /> Watched it — remove from wheel
        </button>
        {winner.letterboxdUrl && (
          <a className="secondary-button" href={winner.letterboxdUrl} target="_blank" rel="noreferrer">
            Open on Letterboxd <ExternalLink size={14} />
          </a>
        )}
        <button className="text-button" onClick={onClear}>Keep it in the wheel</button>
      </div>
    </div>
  );
}

/* ---------------- app ---------------- */

function App() {
  const initial = useMemo(safeLoad, []);
  const [movies, setMovies] = useState(initial.movies);
  const [picked, setPicked] = useState(initial.picked);
  const [history, setHistory] = useState(initial.history);
  const [source, setSource] = useState(initial.source);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [winner, setWinner] = useState(null);
  const [spinning, setSpinning] = useState(false);
  const [noAnim, setNoAnim] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [query, setQuery] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [wheelCount, setWheelCount] = useState(12);
  const [wheelFilms, setWheelFilms] = useState([]);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const fileInput = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    localStorage.setItem(STORE_KEY, JSON.stringify({ movies, picked, history, source }));
  }, [movies, picked, history, source]);

  const remaining = useMemo(() => movies.filter((m) => !picked.includes(m.id)), [movies, picked]);
  const visibleMovies = useMemo(() => {
    const q = query.toLowerCase().trim();
    return remaining.filter((m) => !q || `${m.title} ${m.year}`.toLowerCase().includes(q));
  }, [remaining, query]);

  useEffect(() => setLimit(PAGE_SIZE), [query, movies]);

  // Re-deal the wheel whenever the pool or slice count changes (never mid-spin or while a winner shows).
  useEffect(() => {
    setWheelFilms(sample(remaining, Math.min(wheelCount, remaining.length)));
  }, [remaining.length, wheelCount, movies]);

  useEffect(() => {
    if (winner && window.innerWidth < 900) {
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [winner]);

  async function syncLetterboxd() {
    setLoading(true);
    setNotice("");
    try {
      const response = await fetch("/api/letterboxd/top500");
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || "Sync failed");
      const next = (data.movies || []).map(normalizeMovie).filter(Boolean);
      if (!next.length) throw new Error("The list came back empty. Try importing a CSV.");
      setMovies(next);
      setPicked([]);
      setHistory([]);
      setWinner(null);
      setSource("letterboxd");
      setNotice(`Synced ${next.length} films from the public Letterboxd list.`);
    } catch (error) {
      setNotice(`${error.message} For the most reliable import, download a list CSV from Letterboxd and use Import CSV.`);
    } finally {
      setLoading(false);
    }
  }

  function importCsv(file) {
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: ({ data }) => {
        const next = data.map(normalizeMovie).filter(Boolean);
        if (!next.length) {
          setNotice("No movie titles were found. CSV needs a title/name/film column.");
          return;
        }
        setMovies(next);
        setPicked([]);
        setHistory([]);
        setWinner(null);
        setSource("csv");
        setNotice(`Imported ${next.length} movies from ${file.name}.`);
      },
      error: (error) => setNotice(`CSV import error: ${error.message}`)
    });
  }

  // The winner is chosen first, then the wheel is rotated so that slice stops under the pointer.
  function chooseMovie() {
    if (spinning || !remaining.length) return;
    const pool = sample(remaining, Math.min(wheelCount, remaining.length));
    const idx = Math.floor(Math.random() * pool.length);
    const seg = 360 / pool.length;
    const center = (idx + 0.5) * seg;
    const jitter = (Math.random() - 0.5) * seg * 0.6;

    setSpinning(true);
    setWinner(null);
    setNoAnim(true);
    setWheelFilms(pool);
    setRotation(0);

    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setNoAnim(false);
        setRotation(360 * (6 + Math.floor(Math.random() * 3)) + (360 - center) + jitter);
        window.setTimeout(() => {
          setSpinning(false);
          setWinner(pool[idx]);
        }, SPIN_MS + 150);
      })
    );
  }

  function removeWinner() {
    if (!winner) return;
    setPicked((prev) => [...prev, winner.id]);
    setHistory((prev) => [winner, ...prev]);
    setWinner(null);
  }
  function resetPicks() {
    if (!window.confirm("Reset your picked movies and restore the whole wheel?")) return;
    setPicked([]);
    setHistory([]);
    setWinner(null);
  }
  function restoreMovie(movie) {
    setPicked((prev) => prev.filter((id) => id !== movie.id));
    setHistory((prev) => prev.filter((item) => item.id !== movie.id));
  }

  const n = wheelFilms.length;
  const wheelBackground = n
    ? `conic-gradient(${wheelFilms
        .map((_, i) => {
          const a = (i / n) * 360;
          const b = ((i + 1) / n) * 360;
          const c = WHEEL_COLORS[i % WHEEL_COLORS.length];
          return `${c} ${a}deg ${b - 0.8}deg, #0a0a0c ${b - 0.8}deg ${b}deg`;
        })
        .join(", ")})`
    : "#1a1a1f";
  const labelSize = n <= 8 ? 15 : n <= 12 ? 13 : 11.5;

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="Frame Roulette home">
          <span className="brand-mark">F</span> FRAME<span className="brand-light">ROULETTE</span>
        </a>
        <div className="top-actions">
          <a className="source-link" href={DEFAULT_SOURCE} target="_blank" rel="noreferrer">
            LETTERBOXD TOP 500 <ExternalLink size={13} />
          </a>
          <button className="icon-button" title="Reset selections" onClick={resetPicks}>
            <RotateCcw size={16} />
          </button>
        </div>
      </header>

      <section className="hero">
        <div className="eyebrow"><span className="live-dot" /> THE CINEMA CHOOSES YOU</div>
        <h1>ONE SPIN.<br /><em>ONE FILM.</em></h1>
        <p className="hero-copy">
          A little less scrolling. A little more cinema.<br />
          Find your next watch from Letterboxd's Top 500.
        </p>
        <div className="stats-row">
          <div><strong>{remaining.length.toLocaleString()}</strong><span>IN THE WHEEL</span></div>
          <div className="stat-divider" />
          <div><strong>{picked.length}</strong><span>WATCHED</span></div>
          <div className="stat-divider" />
          <div>
            <strong>{movies.length ? Math.round((picked.length / movies.length) * 100) : 0}%</strong>
            <span>COMPLETE</span>
          </div>
        </div>
      </section>

      <section className="roulette-section">
        <div className="wheel-column">
          <div className={`wheel-stage ${spinning ? "is-spinning" : ""}`}>
            <div className="wheel-pointer" />
            <div
              className={`wheel ${noAnim ? "no-anim" : ""}`}
              style={{ transform: `rotate(${rotation}deg)`, background: wheelBackground, "--spin-ms": `${SPIN_MS}ms` }}
            >
              {wheelFilms.map((movie, i) => (
                <div
                  className="wheel-label"
                  key={`${movie.id}-${i}`}
                  style={{ transform: `rotate(${(i + 0.5) * (360 / n) - 90}deg)`, fontSize: `${labelSize}px` }}
                >
                  <span>{movie.title}</span>
                </div>
              ))}
            </div>
            <div className="wheel-hub">
              <span>FRAME</span>
              <strong>500</strong>
            </div>
          </div>

          <button className="spin-button" disabled={spinning || !remaining.length} onClick={chooseMovie}>
            <Shuffle size={18} />
            {spinning ? "CHOOSING..." : remaining.length ? "SPIN THE WHEEL" : "ALL FILMS WATCHED"}
          </button>

          <div className="slice-picker" aria-label="Number of slices">
            <span>SLICES</span>
            {[8, 12, 16].map((count) => (
              <button
                key={count}
                className={wheelCount === count ? "is-active" : ""}
                disabled={spinning}
                onClick={() => setWheelCount(count)}
              >
                {count}
              </button>
            ))}
          </div>
          <p className="wheel-hint">Each spin deals a fresh set of slices from the films you haven't watched.</p>
        </div>

        <aside className="side-panel" ref={panelRef}>
          <div className="panel-head">
            <span className="eyebrow">YOUR NEXT WATCH</span>
            <span className="tiny-dot" />
          </div>
          {winner ? (
            <WinnerCard winner={winner} onRemove={removeWinner} onClear={() => setWinner(null)} />
          ) : (
            <div className="empty-winner">
              <div className="film-icon"><Film size={30} /></div>
              <h2>{spinning ? "Finding your film..." : "Your next film awaits."}</h2>
              <p>{spinning ? "Trust the wheel." : "Hit spin and let fate decide what you watch tonight."}</p>
            </div>
          )}
          <div className="panel-footer"><span>NO REPEATS</span><span>·</span><span>JUST GREAT FILMS</span></div>
        </aside>
      </section>

      <section className="collection-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">THE COLLECTION</span>
            <h2>Films in the <em>roulette.</em></h2>
          </div>
          <div className="collection-actions">
            <label className="search-box">
              <Search size={15} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a film..." />
            </label>
            <button className="outline-button" onClick={syncLetterboxd} disabled={loading}>
              <RefreshCw size={15} className={loading ? "spin-icon" : ""} />
              {loading ? "Syncing..." : "Sync list"}
            </button>
            <button className="outline-button" onClick={() => fileInput.current?.click()}>
              <Upload size={15} /> Import CSV
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={(e) => {
                importCsv(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>
        </div>

        {notice && (
          <div className="notice">
            <span>{notice}</span>
            <button onClick={() => setNotice("")} aria-label="Dismiss"><X size={15} /></button>
          </div>
        )}

        <div className="collection-note">
          <span className="tiny-dot" />
          {source === "letterboxd" ? "SYNCED FROM LETTERBOXD" : source === "csv" ? "IMPORTED CSV" : "READY TO SYNC"}
          <span className="muted"> · {visibleMovies.length} films remaining</span>
        </div>

        {movies.length === 0 ? (
          <div className="import-empty">
            <Film size={28} />
            <h3>Your collection is waiting.</h3>
            <p>Click <b>Sync list</b> to try the public Letterboxd list, or import a CSV export.</p>
            <button className="primary-button" onClick={syncLetterboxd}>
              <RefreshCw size={15} /> Sync Top 500
            </button>
          </div>
        ) : (
          <div className="movie-grid">
            {visibleMovies.slice(0, limit).map((movie) => (
              <article className="movie-tile" key={movie.id}>
                <div className="tile-poster">
                  <Poster movie={movie} />
                  {movie.rank ? <span className="rank-tag">#{movie.rank}</span> : null}
                </div>
                <div className="tile-title">{movie.title}</div>
                <div className="tile-year">{movie.year || "\u00A0"}</div>
              </article>
            ))}
          </div>
        )}

        {visibleMovies.length > limit && (
          <div className="more-wrap">
            <button className="outline-button" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
              Show more ({visibleMovies.length - limit} left)
            </button>
          </div>
        )}

        <div className="history-toggle">
          <button className="text-button" onClick={() => setShowHistory((v) => !v)}>
            {showHistory ? "Hide" : "Show"} watched films ({history.length})
          </button>
        </div>
        {showHistory && (
          <div className="history-list">
            {history.map((movie) => (
              <div className="history-row" key={movie.id}>
                <span>{movie.title}{movie.year ? ` (${movie.year})` : ""}</span>
                <button className="text-button" onClick={() => restoreMovie(movie)}>Restore to wheel</button>
              </div>
            ))}
          </div>
        )}
      </section>

      <footer>
        <span>FRAME ROULETTE</span>
        <span>MADE FOR THE LOVE OF FILM</span>
        <a href={DEFAULT_SOURCE} target="_blank" rel="noreferrer">LETTERBOXD TOP 500 ↗</a>
      </footer>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
