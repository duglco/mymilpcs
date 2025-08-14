// scripts/fetch-bases.js
// Node >=18 (global fetch). No extra deps needed.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ArcGIS FeatureServer layer (NTAD Military Bases)
const LAYER_URL =
  'https://services.arcgis.com/xOi1kZaI0eWDREZv/arcgis/rest/services/NTAD_Military_Bases/FeatureServer/0';

// Fields we want from the service
const OUT_FIELDS = [
  'mirtaLocationsIdpk',          // stable unique id
  'featureName',                 // install/base name
  'siteName',                    // site name (sometimes more specific)
  'siteReportingComponent',      // service code (branch-ish)
  'stateNameCode',               // e.g., 'NC'
  'countryName'                  // e.g., 'United States'
].join(',');

// Map service codes to human-friendly branches
const BRANCH_MAP = {
  ARMY: 'Army',
  USA: 'Army',
  USAR: 'Army Reserve',
  ARNG: 'Army National Guard',
  NAVY: 'Navy',
  USN: 'Navy',
  USNR: 'Navy Reserve',
  AIR_FORCE: 'Air Force',
  USAF: 'Air Force',
  USAFR: 'Air Force Reserve',
  ANG: 'Air National Guard',
  USMC: 'Marine Corps',
  MARINE_CORPS: 'Marine Corps',
  USMCR: 'Marine Corps Reserve',
  USCG: 'Coast Guard',
  DLA: 'Defense Logistics Agency',
  WHS: 'Washington HQ Services',
};

// ---------- helpers ----------
async function getJSON(url, params) {
  const qs = new URLSearchParams(params);
  const res = await fetch(`${url}?${qs.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${res.url}`);
  return res.json();
}

// Simple polygon/multipolygon centroid (area-weighted)
function centroidOfPolygonCoords(coords) {
  // coords: [ [ [x,y], [x,y], ... ] , ... ] (first ring = outer)
  const ring = coords[0];
  let area = 0, cx = 0, cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    const a = x1 * y2 - x2 * y1;
    area += a;
    cx += (x1 + x2) * a;
    cy += (y1 + y2) * a;
  }
  area *= 0.5;
  if (area === 0) return ring[0];
  return [cx / (6 * area), cy / (6 * area)];
}

function centroidOfGeometry(geom) {
  if (!geom) return [null, null];
  if (geom.type === 'Polygon') return centroidOfPolygonCoords(geom.coordinates);
  if (geom.type === 'MultiPolygon') {
    // choose the largest polygon by (absolute) area
    let best = null, bestArea = -Infinity;
    for (const poly of geom.coordinates) {
      const c = centroidOfPolygonCoords(poly);
      // rough area proxy by bounding box (fast, sufficient for a centroid pick)
      let minx=Infinity, miny=Infinity, maxx=-Infinity, maxy=-Infinity;
      for (const [x, y] of poly[0]) {
        minx = Math.min(minx, x); miny = Math.min(miny, y);
        maxx = Math.max(maxx, x); maxy = Math.max(maxy, y);
      }
      const area = (maxx - minx) * (maxy - miny);
      if (area > bestArea) { bestArea = area; best = c; }
    }
    return best || [null, null];
  }
  // If somehow a point/line sneaks in:
  if (geom.type === 'Point') return geom.coordinates;
  return [null, null];
}

// ---------- main fetch logic ----------
async function fetchAllObjectIds() {
  const data = await getJSON(`${LAYER_URL}/query`, {
    where: '1=1',
    returnIdsOnly: true,
    f: 'json'
  });
  if (!data.objectIds || !data.objectIds.length) {
    throw new Error('No object IDs returned from service.');
  }
  return data.objectIds.sort((a, b) => a - b);
}

async function fetchBatch(objectIds) {
  const data = await getJSON(`${LAYER_URL}/query`, {
    f: 'geojson',
    where: '1=1',
    outFields: OUT_FIELDS,
    objectIds: objectIds.join(','),
    outSR: 4326,
    returnGeometry: true,
  });
  return data; // GeoJSON FeatureCollection
}

async function run() {
  console.log('Fetching object IDs…');
  const oids = await fetchAllObjectIds();
  console.log(`Total features: ${oids.length}`);

  // ArcGIS typically caps at 2000 records per request; use chunks.
  const CHUNK = 1000;
  const features = [];

  for (let i = 0; i < oids.length; i += CHUNK) {
    const batch = oids.slice(i, i + CHUNK);
    console.log(`Fetching ${batch.length} features (${i + 1}–${i + batch.length})…`);
    const fc = await fetchBatch(batch);
    features.push(...fc.features);
  }

  console.log('Transforming to app schema…');

  const rows = features.map((f) => {
    const props = f.properties || {};
    const geom = f.geometry || null;
    const [lon, lat] = centroidOfGeometry(geom);

    // Choose a display name: featureName (install/base) or siteName
    const name = (props.featureName || props.siteName || '').trim();
    const id = (props.mirtaLocationsIdpk || `oid-${props.OBJECTID || Math.random().toString(36).slice(2)}`).toString();

    // branch normalization
    const rawCode = (props.siteReportingComponent || '').trim();
    const branch = BRANCH_MAP[rawCode] || rawCode || 'Unknown';

    return {
      id,
      name,
      branch,
      city: "", // NTAD layer doesn't include city; you could backfill later
      state: props.stateNameCode || "",
      country: props.countryName || "",
      lat,
      lon,
    };
  }).filter(r => Number.isFinite(r.lat) && Number.isFinite(r.lon));

  // Sort for stable diffs
  rows.sort((a, b) => a.name.localeCompare(b.name));

  // Write to src/bases.json
  const outDir = path.resolve(__dirname, '..', 'src');
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, 'bases.json');
  await fs.writeFile(outPath, JSON.stringify(rows, null, 2), 'utf8');

  console.log(`Wrote ${rows.length} bases to ${outPath}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
