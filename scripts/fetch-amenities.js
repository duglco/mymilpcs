import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASES_PATH = path.resolve(__dirname, '..', 'src', 'bases.json');
const OUTPUT_PATH = path.resolve(__dirname, '..', 'src', 'amenities.json');
const AMENITY_CACHE_DIR = path.resolve(__dirname, '.cache', 'amenities');

const OVERPASS_URL = process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter';
const FETCH_RADIUS_METERS = Number(process.env.AMENITY_RADIUS_METERS || 30000);
const REQUEST_SLEEP_MS = Number(process.env.OVERPASS_SLEEP_MS || 1500);
const MAX_RETRIES = Number(process.env.OVERPASS_MAX_RETRIES || 3);

const CATEGORY_RULES = [
  {
    name: 'Hospital',
    matches: (tags) => {
      const amenity = tags.amenity || tags.healthcare;
      return amenity === 'hospital' || amenity === 'clinic';
    },
  },
  {
    name: 'VA',
    matches: (tags) => {
      const text = `${tags.name || ''} ${tags.operator || ''}`.toLowerCase();
      return /\b(va|veterans|v\.a\.)\b/.test(text) && (tags.amenity === 'hospital' || tags.amenity === 'clinic' || tags.healthcare);
    },
  },
  {
    name: 'Childcare',
    matches: (tags) => {
      const amenity = tags.amenity;
      const name = (tags.name || '').toLowerCase();
      return amenity === 'childcare' || amenity === 'kindergarten' || (amenity === 'school' && /child|daycare|prek/.test(name));
    },
  },
  {
    name: 'Pharmacies',
    matches: (tags) => tags.amenity === 'pharmacy',
  },
  {
    name: 'Colleges',
    matches: (tags) => tags.amenity === 'college' || tags.amenity === 'university',
  },
  {
    name: 'Elementary Schools',
    matches: (tags) => tags.amenity === 'school' && /(elementary|primary)/i.test(tags.name || ''),
  },
  {
    name: 'Middle Schools',
    matches: (tags) => tags.amenity === 'school' && /(middle|intermediate)/i.test(tags.name || ''),
  },
  {
    name: 'High Schools',
    matches: (tags) => tags.amenity === 'school' && /(high|secondary)/i.test(tags.name || ''),
  },
  {
    name: 'International Airport',
    matches: (tags) => {
      const aeroway = tags.aeroway;
      if (aeroway !== 'aerodrome' && aeroway !== 'airport') return false;
      return tags.international === 'yes' || Boolean(tags.iata);
    },
  },
  {
    name: 'Walmarts',
    matches: (tags) => tags.shop === 'supermarket' && /(walmart|wal-mart)/i.test(tags.name || ''),
  },
  {
    name: 'Grocery',
    matches: (tags) => tags.shop === 'supermarket' || tags.shop === 'greengrocer' || tags.shop === 'grocery',
  },
  {
    name: 'Gym',
    matches: (tags) => tags.leisure === 'fitness_centre' || tags.leisure === 'sports_centre',
  },
  {
    name: 'Park',
    matches: (tags) => tags.leisure === 'park' || tags.leisure === 'nature_reserve',
  },
];

const CATEGORY_LIMITS = {
  Hospital: 25,
  VA: 15,
  Childcare: 40,
  Pharmacies: 40,
  Colleges: 25,
  'Elementary Schools': 40,
  'Middle Schools': 40,
  'High Schools': 40,
  'International Airport': 5,
  Walmarts: 10,
  Grocery: 40,
  Gym: 40,
  Park: 60,
};

const FILTER_GROUPS = [
  {
    name: 'health',
    limit: 300,
    filters: [
      '["amenity"="hospital"]',
      '["amenity"="clinic"]',
      '["amenity"="pharmacy"]',
    ],
  },
  {
    name: 'education',
    limit: 500,
    filters: [
      '["amenity"="college"]',
      '["amenity"="university"]',
      '["amenity"="school"]["name"~"Elementary|Primary",i]',
      '["amenity"="school"]["name"~"Middle|Intermediate",i]',
      '["amenity"="school"]["name"~"High|Secondary",i]',
    ],
  },
  {
    name: 'family-grocery',
    limit: 400,
    filters: [
      '["amenity"="childcare"]',
      '["amenity"="kindergarten"]',
      '["shop"="supermarket"]',
      '["shop"="grocery"]',
      '["shop"="greengrocer"]',
    ],
  },
  {
    name: 'recreation',
    limit: 400,
    filters: [
      '["leisure"="fitness_centre"]',
      '["leisure"="sports_centre"]',
      '["leisure"="park"]',
      '["leisure"="nature_reserve"]',
    ],
  },
  {
    name: 'transport',
    limit: 100,
    filters: [
      '["aeroway"="aerodrome"]',
      '["aeroway"="airport"]',
    ],
  },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const milesDistance = (lat1, lon1, lat2, lon2) => {
  const R = 3958.8;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

function buildQuery(base, filters, limit) {
  const statements = [];
  for (const filter of filters) {
    const types = filter.types || ['node', 'way', 'relation'];
    for (const type of types) {
      const query = typeof filter === 'string' ? filter : filter.query;
      statements.push(`${type}${query}(around:${FETCH_RADIUS_METERS},${base.lat},${base.lon});`);
    }
  }
  const outLimit = limit ?? 400;
  return `[out:json][timeout:90];(${statements.join('\n')});out center qt ${outLimit};`;
}

function normalizeElement(element) {
  const { tags = {} } = element;
  const coords = element.type === 'node' ? { lat: element.lat, lon: element.lon } : element.center;
  if (!coords) return null;
  const name = tags.name || tags.operator || '';
  return {
    osmType: element.type,
    osmId: element.id,
    lat: coords.lat,
    lon: coords.lon,
    tags,
    name,
  };
}

function categorizeAmenity(base, amenity) {
  const categories = CATEGORY_RULES.filter((rule) => {
    try {
      return rule.matches(amenity.tags, amenity.name || '');
    } catch (err) {
      return false;
    }
  }).map((rule) => rule.name);
  const results = [];
  for (const category of categories) {
    const distance = milesDistance(base.lat, base.lon, amenity.lat, amenity.lon);
    results.push({
      id: `${base.id}-${category}-${amenity.osmType}-${amenity.osmId}`,
      baseId: base.id,
      category,
      name: amenity.name || category,
      lat: amenity.lat,
      lon: amenity.lon,
      distanceMiles: Number(distance.toFixed(2)),
      source: {
        osmType: amenity.osmType,
        osmId: amenity.osmId,
      },
    });
  }
  return results;
}

async function fetchFromOverpass(query, attempt = 1) {
  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    body: query,
    headers: { 'Content-Type': 'text/plain' },
  });
  if (!res.ok) {
    const text = await res.text();
    if (attempt < MAX_RETRIES) {
      const wait = REQUEST_SLEEP_MS * attempt;
      console.warn(`Overpass returned ${res.status}. Retrying in ${wait}ms…`);
      await sleep(wait);
      return fetchFromOverpass(query, attempt + 1);
    }
    throw new Error(`Overpass error ${res.status}: ${text.slice(0, 140)}`);
  }
  return res.json();
}

async function fetchAmenitiesForBase(base) {
  const dedup = new Map();
  for (const group of FILTER_GROUPS) {
    const query = buildQuery(base, group.filters, group.limit);
    let data;
    try {
      data = await fetchFromOverpass(query);
    } catch (err) {
      console.error(`Overpass group ${group.name} failed for ${base.name}: ${err.message}`);
      continue;
    }
    for (const element of data.elements || []) {
      const normalized = normalizeElement(element);
      if (!normalized) continue;
      const key = `${normalized.osmType}/${normalized.osmId}`;
      if (!dedup.has(key)) dedup.set(key, normalized);
    }
    await sleep(REQUEST_SLEEP_MS);
  }
  const grouped = new Map();
  for (const amenity of dedup.values()) {
    for (const entry of categorizeAmenity(base, amenity)) {
      if (!grouped.has(entry.category)) grouped.set(entry.category, []);
      grouped.get(entry.category).push(entry);
    }
  }

  const clamped = [];
  for (const [category, list] of grouped.entries()) {
    list.sort((a, b) => a.distanceMiles - b.distanceMiles);
    const limit = CATEGORY_LIMITS[category] ?? 25;
    clamped.push(...list.slice(0, limit));
  }

  return clamped;
}

function parseArgs() {
  const opts = { limit: Infinity, refresh: false };
  for (const token of process.argv.slice(2)) {
    if (!token.startsWith('--')) continue;
    const [flag, rawValue] = token.slice(2).split('=');
    const value = rawValue ?? 'true';
    if (flag === 'limit') opts.limit = Number(value);
    if (flag === 'skip') opts.skip = Number(value);
    if (flag === 'refresh') opts.refresh = value === 'true';
  }
  return opts;
}

async function loadCache(baseId) {
  try {
    const raw = await fs.readFile(path.join(AMENITY_CACHE_DIR, `${baseId}.json`), 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

async function saveCache(baseId, data) {
  await fs.mkdir(AMENITY_CACHE_DIR, { recursive: true });
  await fs.writeFile(path.join(AMENITY_CACHE_DIR, `${baseId}.json`), JSON.stringify(data, null, 2));
}

async function run() {
  const { limit, skip = 0, refresh } = parseArgs();
  const bases = JSON.parse(await fs.readFile(BASES_PATH, 'utf8'));
  const slice = bases.slice(skip, isFinite(limit) ? skip + limit : undefined);
  const allAmenities = [];

  for (let idx = 0; idx < slice.length; idx++) {
    const base = slice[idx];
    let amenities = null;
    if (!refresh) {
      amenities = await loadCache(base.id);
    }
    if (!amenities) {
      console.log(`Fetching amenities for ${base.name} (${idx + 1 + skip}/${bases.length})`);
      try {
        amenities = await fetchAmenitiesForBase(base);
        await saveCache(base.id, amenities);
      } catch (err) {
        console.error(`Failed to fetch amenities for ${base.name}: ${err.message}`);
        continue;
      }
    } else {
      console.log(`Cache hit for ${base.name}`);
    }
    allAmenities.push(...amenities);
  }

  await fs.writeFile(OUTPUT_PATH, JSON.stringify(allAmenities, null, 2));
  console.log(`Wrote ${allAmenities.length} amenities to ${path.relative(process.cwd(), OUTPUT_PATH)}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
