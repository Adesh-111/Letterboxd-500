# Frame Roulette — Letterboxd Top 500

A local React + Vite movie roulette. Spin for a random film, remove it from the active pool, and preserve your selections in browser local storage.

## Requirements

- Windows 10/11
- Node.js 20 LTS or newer (npm included)
- Internet access for initial install, movie sync, and poster images

## Quick start (Windows)

1. Install Node.js LTS from https://nodejs.org/ (choose the LTS download).
2. Extract `letterboxd-movie-roulette.zip`.
3. Open the extracted folder in File Explorer.
4. Click the folder address bar, type `cmd`, and press Enter.
5. In the Command Prompt window, run:

   ```bash
   npm install
   npm run dev
   ```

6. Open the Vite address printed in the terminal (usually http://localhost:5173).

Keep the terminal open while using the website. `Ctrl+C` stops it.

## Syncing the Letterboxd list

Click **Sync list** in the app. The server attempts to read the public official Letterboxd Top 500 list at:

https://letterboxd.com/official/list/letterboxds-top-500-films/

This is an unofficial public-page parser, not a Letterboxd API integration. Letterboxd may change its markup, block automated access, or change the list. If the live sync does not work, use **Import CSV** instead.

### CSV import

- Download/export a CSV from your source.
- Click **Import CSV**.
- The CSV should include a column named `Name`, `Film`, `Title`, `Film Name`, or `Movie Title`. Optional columns: `Year`, `URL`, `Letterboxd URI`, `Poster URL`, `Rank`, `Position`.
- The app reads the CSV locally in your browser.

For Letterboxd CSV export, use Letterboxd's own account export / list facilities. Public lists may not offer an export button in every view.

## Production build

```bash
npm run build
npm start
```

Open http://localhost:8787. The Express server serves the production `dist` build.

## Important

- Picked movies are removed from the roulette pool in this browser only. The app does not mark them watched on your Letterboxd account.
- Progress is saved using localStorage. Clearing browser data removes it.
- The Letterboxd API is selectively granted by Letterboxd and is not included here; no API keys or Letterboxd login credentials are requested.
- The page parser may need adjustment if Letterboxd's HTML changes.
