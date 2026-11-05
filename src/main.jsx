import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import Papa from "papaparse";
import { RefreshCw, Upload, RotateCcw, Film, ExternalLink, Check, X, Search, Shuffle } from "lucide-react";
import "./styles.css";

const STORE_KEY = "frame-roulette-state-v1";
const DEFAULT_SOURCE = "https://letterboxd.com/official/list/letterboxds-top-500-films/";

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
    letterboxdUrl: String(url).startsWith("http") ? String(url) : (url ? `https://letterboxd.com${url}` : "")
  };
}

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
  const [rotation, setRotation] = useState(0);
  const [query, setQuery] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [wheelCount, setWheelCount] = useState(12);
  const fileInput = useRef(null);
  const wheelRef = useRef(null);

  useEffect(() => {
    localStorage.setItem(STORE_KEY, JSON.stringify({ movies, picked, history, source }));
  }, [movies, picked, history, source]);

  const remaining = useMemo(() => movies.filter(m => !picked.includes(m.id)), [movies, picked]);
  const visibleMovies = useMemo(() => {
    const q = query.toLowerCase().trim();
    return remaining.filter(m => !q || `${m.title} ${m.year}`.toLowerCase().includes(q));
  }, [remaining, query]);

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
      complete: ({ data, errors }) => {
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

  function chooseMovie() {
    if (spinning || !remaining.length) return;
    const selected = remaining[Math.floor(Math.random() * remaining.length)];
    setSpinning(true);
    setWinner(null);
    const turns = 5 + Math.random() * 5;
    setRotation(prev => prev + turns * 360 + Math.random() * 360);
    window.setTimeout(() => {
      setSpinning(false);
      setWinner(selected);
    }, 4200);
  }

  function removeWinner() {
    if (!winner) return;
    setPicked(prev => [...prev, winner.id]);
    setHistory(prev => [winner, ...prev]);
    setWinner(null);
  }
  function resetPicks() {
    if (!window.confirm("Reset your picked movies and restore the whole wheel?")) return;
    setPicked([]);
    setHistory([]);
    setWinner(null);
  }
  function restoreMovie(movie) {
    setPicked(prev => prev.filter(id => id !== movie.id));
    setHistory(prev => prev.filter(item => item.id !== movie.id));
  }

  const segments = useMemo(() => {
    if (!remaining.length) return [];
    return remaining.slice(0, Math.min(wheelCount, remaining.length));
  }, [remaining, wheelCount]);

  const wheelStyle = {
    transform: `rotate(${rotation}deg)`,
    background: segments.length
      ? `conic-gradient(${segments.map((m, i) => {
          const a = (i / segments.length) * 360;
          const b = ((i + 1) / segments.length) * 360;
          return `${i % 2 ? "#292923" : "#39382f"} ${a}deg ${b}deg`;
        }).join(", ")})`
      : "#282821"
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="Frame Roulette home"><span className="brand-mark">F</span> FRAME<span className="brand-light">ROULETTE</span></a>
        <div className="top-actions">
          <a className="source-link" href={DEFAULT_SOURCE} target="_blank" rel="noreferrer">LETTERBOXD TOP 500 <ExternalLink size={13}/></a>
          <button className="icon-button" title="Reset selections" onClick={resetPicks}><RotateCcw size={16}/></button>
        </div>
      </header>

      <section className="hero">
        <div className="eyebrow"><span className="live-dot"/> THE CINEMA CHOOSES YOU</div>
        <h1>ONE SPIN.<br/><em>ONE FILM.</em></h1>
        <p className="hero-copy">A little less scrolling. A little more cinema.<br/>Find your next watch from Letterboxd's Top 500.</p>
        <div className="stats-row">
          <div><strong>{remaining.length.toLocaleString()}</strong><span>IN THE WHEEL</span></div>
          <div className="stat-divider"/>
          <div><strong>{picked.length}</strong><span>SELECTED</span></div>
          <div className="stat-divider"/>
          <div><strong>{movies.length ? Math.round(picked.length / movies.length * 100) : 0}%</strong><span>COMPLETE</span></div>
        </div>
      </section>

      <section className="roulette-section">
        <div className="wheel-column">
          <div className="wheel-stage">
            <div className="wheel-pointer"/>
            <div className={`wheel ${spinning ? "is-spinning" : ""}`} style={wheelStyle} ref={wheelRef}>
              {segments.map((movie, i) => {
                const angle = (i + .5) * (360 / segments.length);
                return <span className="wheel-label" key={movie.id} style={{ transform: `rotate(${angle}deg) translateY(-${Math.min(155, 210 - segments.length * 2)}px) rotate(90deg)` }}>{movie.title}</span>;
              })}
              <div className="wheel-center"><span>FRAME</span><strong>500</strong><small>FILM ROULETTE</small></div>
            </div>
          </div>
          <button className="spin-button" disabled={spinning || !remaining.length} onClick={chooseMovie}>
            <Shuffle size={17}/>{spinning ? "CHOOSING..." : remaining.length ? "SPIN THE WHEEL" : "ALL FILMS SELECTED"}
          </button>
          <p className="wheel-hint">The pick is random from all remaining films.</p>
        </div>

        <aside className="side-panel">
          <div className="panel-head"><span className="eyebrow">YOUR NEXT WATCH</span><span className="tiny-dot"/></div>
          {winner ? (
            <div className="winner-card">
              <div className="winner-poster">
                {winner.poster ? <img src={winner.poster} alt={`${winner.title} poster`} onError={e => e.currentTarget.style.display = "none"}/> : <div className="poster-fallback"><Film size={34}/></div>}
              </div>
              <div className="winner-meta"><span className="eyebrow">THE WHEEL HAS SPOKEN</span><h2>{winner.title}</h2><p>{winner.year || "Feature film"}{winner.rank ? ` · #${winner.rank}` : ""}</p></div>
              <div className="winner-buttons">
                <button className="primary-button" onClick={removeWinner}><Check size={16}/> Remove from wheel</button>
                {winner.letterboxdUrl && <a className="secondary-button" href={winner.letterboxdUrl} target="_blank" rel="noreferrer">Open on Letterboxd <ExternalLink size={14}/></a>}
                <button className="text-button" onClick={() => setWinner(null)}>Spin again (keep this film)</button>
              </div>
            </div>
          ) : (
            <div className="empty-winner">
              <div className="film-icon"><Film size={28}/></div>
              <h2>{spinning ? "Finding your film..." : "Your next film awaits."}</h2>
              <p>{spinning ? "Trust the wheel." : "Hit spin and let fate decide what you watch tonight."}</p>
            </div>
          )}
          <div className="panel-footer"><span>NO REPEATS</span><span>·</span><span>JUST GREAT FILMS</span></div>
        </aside>
      </section>

      <section className="collection-section">
        <div className="section-heading">
          <div><span className="eyebrow">THE COLLECTION</span><h2>Films in the <em>roulette.</em></h2></div>
          <div className="collection-actions">
            <label className="search-box"><Search size={15}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a film..." /></label>
            <button className="outline-button" onClick={syncLetterboxd} disabled={loading}><RefreshCw size={15} className={loading ? "spin-icon" : ""}/>{loading ? "Syncing..." : "Sync list"}</button>
            <button className="outline-button" onClick={() => fileInput.current?.click()}><Upload size={15}/> Import CSV</button>
            <input ref={fileInput} type="file" accept=".csv,text/csv" hidden onChange={e => { importCsv(e.target.files?.[0]); e.target.value = ""; }}/>
          </div>
        </div>
        {notice && <div className="notice"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss"><X size={15}/></button></div>}
        <div className="collection-note"><span className="tiny-dot"/>{source === "letterboxd" ? "SYNCED FROM LETTERBOXD" : source === "csv" ? "IMPORTED CSV" : "READY TO SYNC"} <span className="muted">· Showing {visibleMovies.length} remaining films</span></div>
        {movies.length === 0 ? (
          <div className="import-empty"><Film size={26}/><h3>Your collection is waiting.</h3><p>Click <b>Sync list</b> to try the public Letterboxd list, or import a CSV export.</p><button className="primary-button" onClick={syncLetterboxd}><RefreshCw size={15}/> Sync Top 500</button></div>
        ) : (
          <div className="movie-grid">
            {visibleMovies.slice(0, 60).map(movie => <article className="movie-tile" key={movie.id}>
              <div className="tile-poster">
                {movie.poster ? <img src={movie.poster} alt={`${movie.title} poster`} loading="lazy" onError={e => e.currentTarget.style.display = "none"}/> : <div className="poster-fallback"><Film size={25}/></div>}
                {movie.rank && <span className="rank-tag">#{movie.rank}</span>}
              </div>
              <div className="tile-title">{movie.title}</div><div className="tile-year">{movie.year || " "}</div>
            </article>)}
          </div>
        )}
        {visibleMovies.length > 60 && <p className="more-note">Showing first 60 results. Search to narrow the list.</p>}
        <div className="history-toggle"><button className="text-button" onClick={() => setShowHistory(v => !v)}>{showHistory ? "Hide" : "Show"} selected films ({history.length})</button></div>
        {showHistory && <div className="history-list">{history.map(movie => <div className="history-row" key={movie.id}><span>{movie.title}{movie.year ? ` (${movie.year})` : ""}</span><button className="text-button" onClick={() => restoreMovie(movie)}>Restore to wheel</button></div>)}</div>}
      </section>

      <footer><span>FRAME ROULETTE</span><span>MADE FOR THE LOVE OF FILM</span><a href={DEFAULT_SOURCE} target="_blank" rel="noreferrer">LETTERBOXD TOP 500 ↗</a></footer>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
