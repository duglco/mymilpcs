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

## Deploy to GitHub Pages (Actions)
1. Ensure `vite.config.js` `base` matches your repo path (e.g., '/bases-dashboard/').
2. Commit `.github/workflows/pages.yml` below.
3. Push to `main` and enable Pages → Source: GitHub Actions.
