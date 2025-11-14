import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASES_PATH = path.resolve(__dirname, '..', 'src', 'bases.json');
const CACHE_DIR = path.resolve(__dirname, '.cache');
const CACHE_FILE = path.join(CACHE_DIR, 'localities.json');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function loadCache() {
  try {
    const raw = await fs.readFile(CACHE_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return {};
  }
}

async function saveCache(cache) {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2));
}

function keyFor(lat, lon) {
  return `${lat.toFixed(3)},${lon.toFixed(3)}`;
}

function extractLocality(payload) {
  const admin = payload?.localityInfo?.administrative || [];
  const cityLike = [...admin].reverse().find((entry) => entry.adminLevel >= 7);
  const countyLike = admin.find((entry) => entry.adminLevel === 6);
  const city = cityLike?.name || payload.city || payload.locality || '';
  const county = countyLike?.name || '';
  const stateCode = payload.principalSubdivisionCode?.split('-')[1] || '';
  return {
    city: city.trim(),
    county: county.trim(),
    stateFull: payload.principalSubdivision || '',
    stateCode: stateCode.trim().toUpperCase(),
    postcode: payload.postcode || '',
  };
}

async function lookup(lat, lon) {
  const url = new URL('https://api.bigdatacloud.net/data/reverse-geocode-client');
  url.search = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    localityLanguage: 'en'
  });
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Reverse geocode failed with ${res.status}`);
  }
  const json = await res.json();
  return extractLocality(json);
}

async function run() {
  const cache = await loadCache();
  const bases = JSON.parse(await fs.readFile(BASES_PATH, 'utf8'));

  let hits = 0;
  let misses = 0;

  for (const base of bases) {
    if (!base || base.country?.toLowerCase() !== 'usa') continue;
    if (base.city && base.city.trim().length > 0) continue;
    const k = keyFor(base.lat, base.lon);
    let info = cache[k];
    if (!info) {
      misses += 1;
      info = await lookup(base.lat, base.lon);
      cache[k] = info;
      await sleep(250); // stay well under public rate limits
    } else {
      hits += 1;
    }
    if (info.city) base.city = info.city;
    if (info.county) base.county = info.county;
    if (!base.state && info.stateCode) base.state = info.stateCode;
    base.stateFull = info.stateFull || base.stateFull || '';
    if (info.postcode) base.postcode = info.postcode;
  }

  await fs.writeFile(BASES_PATH, JSON.stringify(bases, null, 2));
  await saveCache(cache);

  console.log(`Locality enrichment complete. cache hits=${hits}, misses=${misses}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
