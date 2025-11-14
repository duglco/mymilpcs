// Node >=18
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const QUERY_URL =
  'https://services.arcgis.com/xOi1kZaI0eWDREZv/arcgis/rest/services/NTAD_Military_Bases/FeatureServer/0/query';

// Fields we want
const OUT_FIELDS = [
  'OBJECTID',
  'mirtaLocationsIdpk',
  'featureName',
  'siteName',
  'siteReportingComponent',
  'stateNameCode',
  'countryName'
].join(',');

// POST helper
async function postJSON(url, params) {
  const body = new URLSearchParams(params);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${res.url}`);
  return res.json();
}

// Simple centroid for Polygon / MultiPolygon in WGS84
function centroidOfPolygonCoords(coords) {
  const ring = coords[0];
  let area = 0, cx = 0, cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i], [x2, y2] = ring[i + 1];
    const a = x1 * y2 - x2 * y1;
    area += a; cx += (x1 + x2) * a; cy += (y1 + y2) * a;
  }
  area *= 0.5;
  if (area === 0) return ring[0];
  return [cx / (6 * area), cy / (6 * area)];
}
function centroidOfGeometry(geom) {
  if (!geom) return [null, null];
  if (geom.type === 'Polygon') return centroidOfPolygonCoords(geom.coordinates);
  if (geom.type === 'MultiPolygon') {
    // pick largest by rough bbox area
    let best = null, bestArea = -Infinity;
    for (const poly of geom.coordinates) {
      const c = centroidOfPolygonCoords(poly);
      let minx=Infinity,miny=Infinity,maxx=-Infinity,maxy=-Infinity;
      for (const [x, y] of poly[0]) {
        minx = Math.min(minx,x); miny = Math.min(miny,y);
        maxx = Math.max(maxx,x); maxy = Math.max(maxy,y);
      }
      const area = (maxx-minx)*(maxy-miny);
      if (area > bestArea) { bestArea = area; best = c; }
    }
    return best || [null, null];
  }
  if (geom.type === 'Point') return geom.coordinates;
  return [null, null];
}

async function fetchCount() {
  const j = await postJSON(QUERY_URL, {
    f: 'json',
    where: '1=1',
    returnCountOnly: 'true'
  });
  if (!j.count) throw new Error('Could not get count');
  return j.count;
}

async function fetchPage(offset, pageSize) {
  // Return GeoJSON for easy geometry handling
  return postJSON(QUERY_URL, {
    f: 'geojson',
    where: '1=1',
    outFields: OUT_FIELDS,
    orderByFields: 'OBJECTID ASC',
    resultOffset: String(offset),
    resultRecordCount: String(pageSize),
    outSR: '4326',
    returnGeometry: 'true'
  });
}

async function run() {
  const total = await fetchCount();
  console.log(`Features: ${total}`);

  const pageSize = 500; // safe for ArcGIS
  const feats = [];

  for (let offset = 0; offset < total; offset += pageSize) {
    console.log(`Fetching ${offset + 1}–${Math.min(offset + pageSize, total)}…`);
    const fc = await fetchPage(offset, pageSize);
    feats.push(...(fc.features || []));
  }

  const BRANCH_MAP = {
    ARMY: 'Army', USA: 'Army',
    USAR: 'Army Reserve', ARNG: 'Army National Guard',
    NAVY: 'Navy', USN: 'Navy', USNR: 'Navy Reserve',
    AIR_FORCE: 'Air Force', USAF: 'Air Force', USAFR: 'Air Force Reserve', ANG: 'Air National Guard',
    USMC: 'Marine Corps', MARINE_CORPS: 'Marine Corps', USMCR: 'Marine Corps Reserve',
    USCG: 'Coast Guard', DLA: 'Defense Logistics Agency', WHS: 'Washington HQ Services'
  };

  const toUpper = (value) => (value || '').toString().trim().toUpperCase();

  const rows = feats.map(f => {
    const p = f.properties || {};
    const [lon, lat] = centroidOfGeometry(f.geometry || null);
    const name = (p.featureName || p.siteName || '').trim();
    const branchKey = toUpper(p.siteReportingComponent).replace(/\s+/g, '');
    const branch = BRANCH_MAP[branchKey] || branchKey || 'Unknown';
    return {
      id: String(p.sdsId || p.mirtaLocationsIdpk || p.OBJECTID || f.id || name).trim() || String(f.id),
      name,
      branch,
      city: '',                                   // not provided by this layer
      state: toUpper(p.stateNameCode),
      country: p.countryName || '',
      lat, lon
    };
  }).filter(r => Number.isFinite(r.lat) && Number.isFinite(r.lon));

  rows.sort((a, b) => a.name.localeCompare(b.name));

  const outDir = path.resolve(__dirname, '..', 'src');
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, 'bases.json'), JSON.stringify(rows, null, 2), 'utf8');
  console.log(`Wrote ${rows.length} bases to src/bases.json`);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
