# Military Bases & Amenities Dashboard

A Vite + React single-page app (no server) that lists U.S. military bases and counts nearby amenities within a chosen radius. Inspired by the fast, sortable table UI of ncov2019.live/data.

## Quick start (local)
```bash
npm install
npm run dev
```

## Build
```bash
npm run build
```

## Refreshing data

The dashboard no longer relies on mock amenities. The `scripts/` folder contains a small pipeline you can run periodically:

1. **Military bases**
   ```bash
   npm run fetch:bases    # pulls the DoT NTAD base layer (name, branch, geometry)
   npm run enrich:bases   # reverse-geocodes each base to store city/county details
   ```
2. **Amenities from OpenStreetMap/Overpass**
   ```bash
   npm run fetch:amenities -- --limit=50 --skip=0
   ```
   The amenity script respects a cache (`scripts/.cache/amenities/`) so you can chunk work to avoid Overpass rate limits:
   - `--limit` controls how many bases to process in this run (default: all).
   - `--skip` lets you resume at an offset (`--skip=100 --limit=50`).
   - Set `AMENITY_RADIUS_METERS` or `OVERPASS_URL` env vars to change search radius or use another Overpass mirror.
   - Re-run with `--refresh=true` to ignore cached responses for a base.

Both commands rewrite `src/bases.json` and `src/amenities.json`, which the React app consumes directly.

## Deploy to GitHub Pages (Actions)
1. Ensure `vite.config.js` `base` matches your repo path (e.g., '/bases-dashboard/').
2. Commit `.github/workflows/pages.yml` below.
3. Push to `main` and enable Pages → Source: GitHub Actions.
