
import React, { useMemo, useState } from "react";
import BASES from './bases.json';

import {
  Search,
  Filter,
  Download,
  MapPin,
  Building2,
  Dumbbell,
  GraduationCap,
  Trees,
  ShoppingCart,
  Plane,
  Hospital,
} from "lucide-react";

/**
 * Military Bases & Amenities — Single-file React prototype
 * "Like ncov2019.live/data" → fast, sortable table with filters.
 * Demo dataset + amenity scoring. Replace BASES/AMENITIES or fetch real data.
 */

function milesDistance(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const CATEGORY_META = {
  Hospital: { icon: Hospital, weight: 3, chip: "Hospital" },
  Grocery: { icon: ShoppingCart, weight: 1, chip: "Grocery" },
  School: { icon: GraduationCap, weight: 1, chip: "School" },
  Park: { icon: Trees, weight: 1, chip: "Park" },
  Gym: { icon: Dumbbell, weight: 1, chip: "Gym" },
  VA: { icon: Building2, weight: 3, chip: "VA" },
  Airport: { icon: Plane, weight: 2, chip: "Airport" },
};

const CATEGORY_LIST = Object.keys(CATEGORY_META);



function placeAround(base, milesEast, milesNorth) {
  const milesPerDegLat = 69;
  const milesPerDegLon = 69 * Math.cos((base.lat * Math.PI) / 180);
  const lat = base.lat + milesNorth / milesPerDegLat;
  const lon = base.lon + milesEast / milesPerDegLon;
  return { lat, lon };
}

let amenityAutoId = 1;
function mkAmenity(base, category, label, e, n) {
  const { lat, lon } = placeAround(base, e, n);
  return { id: `am-${amenityAutoId++}`, baseId: base.id, name: label, category, lat, lon };
}

function synthAmenitiesForBase(base) {
  const A = [];
  const off = (miles) => miles;
  A.push(
    mkAmenity(base, "Hospital", `${base.city} Medical Center`, 3, 2),
    mkAmenity(base, "Hospital", `${base.city} Community Hospital`, -4, 1.5)
  );
  if (["jbsa", "naval-station-norfolk", "nellis-afb"].includes(base.id)) {
    A.push(mkAmenity(base, "Hospital", `${base.city} Regional Hospital`, 5.5, -1.5));
  }
  A.push(mkAmenity(base, "VA", `VA Clinic ${base.city}`, -2.5, -1.2));
  if (["fort-liberty", "wright-patt", "jbsa"].includes(base.id)) {
    A.push(mkAmenity(base, "VA", `VA Medical ${base.state}`, 6, 2.3));
  }
  A.push(
    mkAmenity(base, "Grocery", `SuperMart ${base.city}`, 1.2, -0.8),
    mkAmenity(base, "Grocery", `FreshCo ${base.city}`, -2.1, 2.2),
    mkAmenity(base, "Grocery", `Daily Foods`, 4.0, 0.5),
    mkAmenity(base, "Grocery", `Discount Grocers`, -4.6, -1.1)
  );
  A.push(
    mkAmenity(base, "School", `${base.city} Elementary`, 2.0, 1.2),
    mkAmenity(base, "School", `${base.city} High School`, -3.2, 0.7),
    mkAmenity(base, "School", `${base.city} Middle School`, 0.9, -1.8)
  );
  A.push(
    mkAmenity(base, "Park", `${base.city} Central Park`, 1.4, 3.1),
    mkAmenity(base, "Park", `Lakeside Park`, -2.8, -2.2),
    mkAmenity(base, "Park", `Trailhead Reserve`, 3.9, -0.6)
  );
  A.push(
    mkAmenity(base, "Gym", `PowerGym ${base.city}`, -1.6, 1.0),
    mkAmenity(base, "Gym", `24-7 Fitness`, 2.3, -1.7),
    mkAmenity(base, "Gym", `BaseFit`, 5.2, 0.2)
  );
  A.push(mkAmenity(base, "Airport", `${base.city} Intl. Airport`, 15, 4));
  return A;
}

const AMENITIES = BASES.flatMap((b) => synthAmenitiesForBase(b));

function classNames(...xs) { return xs.filter(Boolean).join(" "); }
function unique(arr) { return Array.from(new Set(arr)); }

export default function MilitaryBasesDashboard() {
  const [search, setSearch] = useState("");
  const [branch, setBranch] = useState("All");
  const [state, setState] = useState("All");
  const [radius, setRadius] = useState(10);
  const [selectedCats, setSelectedCats] = useState(() =>
    CATEGORY_LIST.reduce((acc, k) => ({ ...acc, [k]: true }), {})
  );
  const [requireHospital, setRequireHospital] = useState(false);
  const [requireVA, setRequireVA] = useState(false);
  const [sortBy, setSortBy] = useState({ key: "score", dir: "desc" });

  const stateOptions = useMemo(() => ["All", ...unique(BASES.map((b) => b.state)).sort()], []);
  const branchOptions = useMemo(() => ["All", ...unique(BASES.map((b) => b.branch)).sort()], []);

  const perBaseStats = useMemo(() => {
    const out = {};
    for (const b of BASES) {
      const counts = {}; let score = 0;
      for (const c of CATEGORY_LIST) counts[c] = 0;
      for (const a of AMENITIES) {
        if (a.baseId !== b.id) continue;
        if (!selectedCats[a.category]) continue;
        const d = milesDistance(b.lat, b.lon, a.lat, a.lon);
        if (d <= radius) { counts[a.category]++; score += CATEGORY_META[a.category].weight; }
      }
      out[b.id] = { counts, score };
    }
    return out;
  }, [radius, selectedCats]);

  const filtered = useMemo(() => BASES.filter((b) => {
    if (branch !== "All" && b.branch !== branch) return false;
    if (state !== "All" && b.state !== state) return false;
    if (search) {
      const q = search.toLowerCase();
      const s = `${b.name} ${b.city} ${b.state} ${b.branch}`.toLowerCase();
      if (!s.includes(q)) return false;
    }
    if (requireHospital && perBaseStats[b.id].counts["Hospital"] < 1) return false;
    if (requireVA && perBaseStats[b.id].counts["VA"] < 1) return false;
    return true;
  }), [branch, state, search, requireHospital, requireVA, perBaseStats]);

  const sorted = useMemo(() => {
    const arr = [...filtered]; const { key, dir } = sortBy; const mul = dir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      if (key === "name") return mul * a.name.localeCompare(b.name);
      if (key === "branch") return mul * a.branch.localeCompare(b.branch);
      if (key === "state") return mul * a.state.localeCompare(b.state);
      if (key === "score") return mul * (perBaseStats[a.id].score - perBaseStats[b.id].score);
      if (CATEGORY_LIST.includes(key)) return mul * (perBaseStats[a.id].counts[key] - perBaseStats[b.id].counts[key]);
      return 0;
    });
    return arr;
  }, [filtered, sortBy, perBaseStats]);

  const maxScore = useMemo(() => Math.max(1, ...BASES.map((b) => perBaseStats[b.id].score)), [perBaseStats]);

  function toggleCat(cat) { setSelectedCats((s) => ({ ...s, [cat]: !s[cat] })); }
  function setSort(key) { setSortBy((p) => p.key === key ? { key, dir: p.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }); }

  function exportCSV() {
    const headers = ["Base", "Branch", "City", "State", "Score", ...CATEGORY_LIST.map((c) => `${c} (within ${radius}mi)`)];
    const rows = sorted.map((b) => [b.name, b.branch, b.city, b.state, perBaseStats[b.id].score, ...CATEGORY_LIST.map((c) => perBaseStats[b.id].counts[c])]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `\"${String(v).replaceAll('\"', '\"\"')}\"`).join(",")).join("\\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `bases-amenities-${radius}mi.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-40 backdrop-blur supports-[backdrop-filter]:bg-slate-900/60 bg-slate-900/80 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <MapPin className="w-6 h-6" />
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">
              U.S. Military Bases & Nearby Amenities
            </h1>
          </div>
          <div className="ml-auto text-xs sm:text-sm text-slate-400">
            Prototype • demo dataset • client‑side only
          </div>
        </div>
      </header>

      <section className="max-w-7xl mx-auto px-4 py-4">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          <div className="lg:col-span-4">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search base, city, state, branch…"
                className="w-full pl-10 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          <div className="lg:col-span-2 flex gap-2">
            <select value={branch} onChange={(e) => setBranch(e.target.value)} className="w-1/2 lg:w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500">
              {["All", ...unique(BASES.map(b=>b.branch))].map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
            <select value={state} onChange={(e) => setState(e.target.value)} className="w-1/2 lg:w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500">
              {["All", ...unique(BASES.map(b=>b.state)).sort()].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="lg:col-span-3">
            <div className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800">
              <div className="flex items-center justify-between text-sm text-slate-300">
                <div className="flex items-center gap-2"><Filter className="w-4 h-4" /> Radius: {radius} mi</div>
                <div className="text-xs text-slate-400">(1–25mi)</div>
              </div>
              <input type="range" min={1} max={25} value={radius} onChange={(e) => setRadius(parseInt(e.target.value))} className="w-full mt-2" />
            </div>
          </div>
          <div className="lg:col-span-3 flex items-stretch gap-2">
            <button onClick={exportCSV} className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 transition shadow-sm">
              <Download className="w-4 h-4" /><span className="text-sm">Export CSV</span>
            </button>
            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-sm">
              <input type="checkbox" checked={requireHospital} onChange={(e) => setRequireHospital(e.target.checked)} />Must have hospital
            </label>
            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-sm">
              <input type="checkbox" checked={requireVA} onChange={(e) => setRequireVA(e.target.checked)} />Must have VA
            </label>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {CATEGORY_LIST.map((cat) => {
            const Icon = CATEGORY_META[cat].icon; const active = selectedCats[cat];
            return (
              <button key={cat} onClick={() => toggleCat(cat)} className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border transition text-sm ${active ? "bg-slate-800 border-slate-700" : "bg-slate-900 border-slate-800 opacity-60"}`} aria-pressed={active} title={`Toggle ${cat}`}>
                <Icon className="w-4 h-4" /> {cat}
              </button>
            );
          })}
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 pb-10">
        <div className="overflow-auto rounded-2xl border border-slate-800 shadow-xl bg-slate-900">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-900/70 sticky top-0 z-10">
              <tr className="text-left text-slate-300">
                <Th label="Base" now={sortBy} k="name" onSort={setSort} />
                <Th label="Branch" now={sortBy} k="branch" onSort={setSort} />
                <Th label="State" now={sortBy} k="state" onSort={setSort} />
                <Th label="Score" now={sortBy} k="score" onSort={setSort} />
                {CATEGORY_LIST.map((c) => <Th key={c} label={c} now={sortBy} k={c} onSort={setSort} />)}
              </tr>
            </thead>
            <tbody>
              {sorted.map((b, idx) => {
                const stats = perBaseStats[b.id];
                return (
                  <tr key={b.id} className={`border-t border-slate-800 hover:bg-slate-800/40 transition ${idx % 2 === 1 ? "bg-slate-950/20" : ""}`}>
                    <td className="px-3 py-3">
                      <div className="font-medium">{b.name}</div>
                      <div className="text-xs text-slate-400 flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5" /> {b.city}, {b.state}
                      </div>
                    </td>
                    <td className="px-3 py-3">{b.branch}</td>
                    <td className="px-3 py-3">{b.state}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-28 h-2 rounded-full bg-slate-800 overflow-hidden">
                          <div className="h-2 bg-indigo-500" style={{ width: `${(stats.score / maxScore) * 100}%` }}
 />
                        </div>
                        <span className="tabular-nums">{stats.score}</span>
                      </div>
                    </td>
                    {CATEGORY_LIST.map((c) => {
                      const Icon = CATEGORY_META[c].icon; const count = stats.counts[c];
                      return (
                        <td key={c} className="px-3 py-3">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs ${count > 0 ? "bg-slate-800 text-slate-100" : "bg-slate-900 text-slate-500 border border-slate-800"}`}>
                            <Icon className="w-3.5 h-3.5" />
                            <span className="tabular-nums">{count}</span>
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {sorted.length === 0 && (
                <tr><td colSpan={4 + CATEGORY_LIST.length} className="px-3 py-8 text-center text-slate-400">No bases match your filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 text-xs text-slate-400">
          <p>Scoring: Hospital×3, VA×3, Airport×2, others×1 within chosen miles. Adjust weights in <code>CATEGORY_META</code>.</p>
          <p className="mt-2">To plug in real data, replace <code>BASES</code>/<code>AMENITIES</code> or fetch JSON and map into this shape.</p>
        </div>
      </section>
    </div>
  );
}

function Th({ label, now, k, onSort }) {
  const active = now.key === k;
  return (
    <th className="px-3 py-2 font-medium text-xs tracking-wide uppercase select-none cursor-pointer" onClick={() => onSort(k)} title={`Sort by ${label}`}>
      <div className="flex items-center gap-1.5">
        <span>{label}</span>
        <span className={`transition ${active ? "opacity-100" : "opacity-30"}`}>{active ? (now.dir === "asc" ? "▲" : "▼") : "↕"}</span>
      </div>
    </th>
  );
}
