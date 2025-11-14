import React, { useEffect, useMemo, useState } from "react";
import BASES from './bases.json';
import AMENITIES from './amenities.json';

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
  Baby,
  Pill,
  X
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
  const dLon = toRad(lon2 - lon1); // fixed
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const CATEGORY_META = {
  Hospital:             { icon: Hospital,     chip: "Hospital" },
  VA:                   { icon: Building2,    chip: "VA" },
  Pharmacies:           { icon: Pill,         chip: "Pharmacy" },
  Childcare:            { icon: Baby,         chip: "Childcare" },
  Grocery:              { icon: ShoppingCart, chip: "Grocery" },
  Gym:                  { icon: Dumbbell,     chip: "Gym" },
  Park:                 { icon: Trees,        chip: "Park" },
  Colleges:             { icon: GraduationCap,chip: "College" },
  "International Airport": { icon: Plane,    chip: "Intl Airport" },
  Walmarts:             { icon: ShoppingCart, chip: "Walmart" }
};
const CATEGORY_LIST = Object.keys(CATEGORY_META);

const normState = (s) => (s ?? "").trim().toUpperCase(); // always 2-letter caps if input is a 2-letter code

function unique(arr) { return Array.from(new Set(arr)); }

// --------- NEW: Compact width + header-shortening helpers ---------
const COMPACT_CAT_W = "w-[84px]"; // ~84px per category column
const shortHeader = (k) => {
  const map = {
    "International Airport": "Intl Airport",
  };
  return map[k] ?? k;
};

const buildCategoryState = () =>
  CATEGORY_LIST.reduce((acc, key) => {
    acc[key] = true;
    return acc;
  }, {});

const cloneFilterState = (filters) => ({
  ...filters,
  selectedCats: { ...filters.selectedCats }
});

export default function MilitaryBasesDashboard() {
  const [search, setSearch] = useState("");
  const [branch, setBranch] = useState("All");
  const [state, setState] = useState("All");
  const [radius, setRadius] = useState(10);
  const [selectedCats, setSelectedCats] = useState(() => buildCategoryState());
  const [requireHospital, setRequireHospital] = useState(false);
  const [requireVA, setRequireVA] = useState(false);
  const [sortBy, setSortBy] = useState({ key: "name", dir: "asc" });
  const [filtersModalOpen, setFiltersModalOpen] = useState(true);
  const [filtersApplied, setFiltersApplied] = useState(false);

  // ----------- OPTIONS: state (2-letter caps, dedup) & branch (case-sensitive) -----------
  const stateOptions = useMemo(() => {
    const m = new Set();
    for (const b of BASES) {
      if (b.state) m.add(normState(b.state));
    }
    return ["All", ...Array.from(m).sort()];
  }, []);

  const branchOptions = useMemo(() => ["All", ...unique(BASES.map((b) => b.branch)).sort()], []);

  const activeCategories = useMemo(
    () => CATEGORY_LIST.filter((cat) => selectedCats[cat]),
    [selectedCats]
  );

  const amenitiesByBase = useMemo(() => {
    const map = {};
    for (const amenity of AMENITIES) {
      if (!CATEGORY_META[amenity.category]) continue;
      if (!map[amenity.baseId]) map[amenity.baseId] = [];
      map[amenity.baseId].push(amenity);
    }
    return map;
  }, []);

  const perBaseStats = useMemo(() => {
    const out = {};
    for (const b of BASES) {
      const counts = {};
      for (const c of CATEGORY_LIST) counts[c] = 0;
      const amenities = amenitiesByBase[b.id] || [];
      for (const a of amenities) {
        const d = milesDistance(b.lat, b.lon, a.lat, a.lon);
        if (d <= radius) counts[a.category]++;
      }
      out[b.id] = { counts };
    }
    return out;
  }, [radius, amenitiesByBase]);

  const filtered = useMemo(() => BASES.filter((b) => {
    if (branch !== "All" && b.branch !== branch) return false; // branch remains case-sensitive
    if (state !== "All" && normState(b.state) !== state) return false; // compare with uppercase
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
      if (key === "state") return mul * normState(a.state).localeCompare(normState(b.state));
      if (CATEGORY_LIST.includes(key)) return mul * ((perBaseStats[a.id]?.counts[key] || 0) - (perBaseStats[b.id]?.counts[key] || 0));
      return 0;
    });
    return arr;
  }, [filtered, sortBy, perBaseStats]);

  function setSort(key) { setSortBy((p) => p.key === key ? { key, dir: p.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }); }
  const currentFilters = useMemo(() => ({
    branch,
    state,
    radius,
    requireHospital,
    requireVA,
    selectedCats,
  }), [branch, state, radius, requireHospital, requireVA, selectedCats]);

  const filtersReady = filtersApplied && activeCategories.length > 0;
  const exportDisabled = !filtersReady || sorted.length === 0;
  const filtersPrompt = !filtersApplied
    ? "Open Filters to choose the locations and amenities you care about."
    : "Select at least one amenity to display results.";

  function handleApplyFilters(next) {
    setBranch(next.branch);
    setState(next.state);
    setRadius(next.radius);
    setRequireHospital(next.requireHospital);
    setRequireVA(next.requireVA);
    setSelectedCats({ ...next.selectedCats });
    setFiltersModalOpen(false);
    setFiltersApplied(true);
  }

  function exportCSV() {
    const headers = ["Base", "Branch", "City", "State", ...activeCategories.map((c) => `${c} (within ${radius}mi)`)];

    const rows = sorted.map((b) => {
      const stats = perBaseStats[b.id] || { counts: {} };
      return [
        b.name,
        b.branch,
        b.city,
        normState(b.state),
        ...activeCategories.map((c) => stats.counts[c] || 0)
      ];
    });

    const csv = [headers, ...rows]
      .map((r) => r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `bases-amenities-${radius}mi.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-40 backdrop-blur supports-[backdrop-filter]:bg-slate-900/60 bg-slate-900/80 border-b border-slate-800">
        <div className="max-w-screen-2xl mx-auto px-4 py-4 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <MapPin className="w-6 h-6" />
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">
              U.S. Military Bases & Nearby Amenities
            </h1>
          </div>
          <div className="ml-auto text-xs sm:text-sm text-slate-400">
            Prototype • demo dataset • client-side only
          </div>
        </div>
      </header>

      <section className="max-w-screen-2xl mx-auto px-4 py-4 space-y-3">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          <div className="lg:col-span-6">
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

          <div className="lg:col-span-3 flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={() => setFiltersModalOpen(true)}
              className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 hover:border-indigo-500 hover:text-indigo-200 transition"
            >
              <Filter className="w-4 h-4" />
              <span className="text-sm">{filtersApplied ? "Adjust filters" : "Set filters"}</span>
            </button>
            <button
              type="button"
              onClick={exportCSV}
              disabled={exportDisabled}
              className={`inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl shadow-sm ${exportDisabled ? "bg-slate-800 text-slate-500 cursor-not-allowed" : "bg-indigo-600 hover:bg-indigo-500"}`}
            >
              <Download className="w-4 h-4" />
              <span className="text-sm">Export CSV</span>
            </button>
          </div>

          <div className="lg:col-span-3 px-3 py-3 rounded-xl bg-slate-900 border border-slate-800 text-sm text-slate-100 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 uppercase tracking-wide text-[11px]">Branch</span>
              <span>{branch}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 uppercase tracking-wide text-[11px]">State</span>
              <span>{state}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 uppercase tracking-wide text-[11px]">Radius</span>
              <span>{radius} mi</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 uppercase tracking-wide text-[11px]">Hospital</span>
              <span>{requireHospital ? "Required" : "Optional"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 uppercase tracking-wide text-[11px]">VA</span>
              <span>{requireVA ? "Required" : "Optional"}</span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-3">
          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-400 mb-2">
            <span>Selected amenities</span>
            <span>{activeCategories.length} of {CATEGORY_LIST.length}</span>
          </div>
          {activeCategories.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {activeCategories.map((cat) => {
                const Icon = CATEGORY_META[cat].icon;
                return (
                  <span key={cat} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-sm">
                    <Icon className="w-4 h-4 text-slate-300" />
                    <span>{cat}</span>
                  </span>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-slate-400">No amenities selected yet. Use filters to choose locations like schools, gyms, parks, or airports.</p>
          )}
        </div>
      </section>

      {/* Data table section with centered, non-overlapping sticky header and compact columns */}
      <section className="max-w-screen-2xl mx-auto px-4 pb-10">
        <div className="mx-auto w-full">
          <div className="relative rounded-2xl border border-slate-800 shadow-xl bg-slate-900">
            {filtersReady ? (
              <div className="overflow-x-auto lg:overflow-x-hidden">
                <table className="w-full text-sm table-fixed text-[13px]">
                  <colgroup>
                    <col className="w-[320px]" />
                    <col className="w-[140px]" />
                    <col className="w-[100px]" />
                    {activeCategories.map((_, i) => (
                      <col key={i} className={COMPACT_CAT_W} />
                    ))}
                  </colgroup>

                  <thead className="sticky top-0 z-20 bg-slate-900">
                    <tr className="text-left text-slate-300">
                      <Th label="Base"   now={sortBy} k="name"  onSort={setSort} />
                      <Th label="Branch" now={sortBy} k="branch" onSort={setSort} />
                      <Th label="State"  now={sortBy} k="state"  onSort={setSort} />
                      {activeCategories.map((c) => (
                        <Th key={c} label={shortHeader(c)} now={sortBy} k={c} onSort={setSort} />
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {sorted.map((b, idx) => {
                      const stats = perBaseStats[b.id] || { counts: {} };
                      const locationLabel = [b.city, normState(b.state)].filter(Boolean).join(", ") || "Unknown";
                      return (
                        <tr
                          key={b.id}
                          className={`border-t border-slate-800 ${idx % 2 === 1 ? "bg-slate-950/20" : ""} hover:bg-slate-800/40 transition`}
                        >
                          <td className="px-3 py-3 align-top">
                            <div className="font-medium break-words whitespace-normal">{b.name}</div>
                            <div className="text-xs text-slate-400 flex items-center gap-1 mt-1">
                              <MapPin className="w-3.5 h-3.5" /> {locationLabel}
                            </div>
                          </td>
                          <td className="px-3 py-3 align-top">{b.branch}</td>
                          <td className="px-3 py-3 align-top">{normState(b.state)}</td>

                          {activeCategories.map((c) => {
                            const Icon = CATEGORY_META[c].icon;
                            const count = stats.counts[c] || 0;
                            return (
                              <td key={c} className="px-2 py-2 text-center">
                                <span className={`inline-flex items-center justify-center gap-1 px-2 py-1 rounded-full text-[11px] ${count > 0 ? "bg-slate-800 text-slate-100" : "bg-slate-900 text-slate-500 border border-slate-800"}`}>
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
                      <tr>
                        <td colSpan={3 + activeCategories.length} className="px-3 py-8 text-center text-slate-400">
                          No bases match your filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-10 text-center text-slate-400">
                {filtersPrompt}
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 text-xs text-slate-400">
          <p>Counts represent real amenities pulled from OpenStreetMap within the {radius}-mile radius you choose.</p>
          <p className="mt-2">Use Filters anytime to adjust branches, locations, distance, or amenity categories.</p>
        </div>
      </section>

      <FilterModal
        open={filtersModalOpen}
        initialFilters={currentFilters}
        stateOptions={stateOptions}
        branchOptions={branchOptions}
        categoryList={CATEGORY_LIST}
        onApply={handleApplyFilters}
        onClose={() => setFiltersModalOpen(false)}
      />
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

function FilterModal({ open, initialFilters, stateOptions, branchOptions, categoryList, onApply, onClose }) {
  const [draft, setDraft] = useState(() => cloneFilterState(initialFilters));

  useEffect(() => {
    if (open) setDraft(cloneFilterState(initialFilters));
  }, [open, initialFilters]);

  if (!open) return null;

  const update = (field, value) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
  };

  const toggleCategory = (cat) => {
    setDraft((prev) => ({
      ...prev,
      selectedCats: { ...prev.selectedCats, [cat]: !prev.selectedCats[cat] }
    }));
  };

  const hasAmenitySelection = Object.values(draft.selectedCats).some(Boolean);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center px-4 py-6">
      <div className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div>
            <p className="text-lg font-semibold">Choose filters</p>
            <p className="text-sm text-slate-400">Pick branches, locations, radius, and the amenities to compare.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-6 space-y-6 max-h-[80vh] overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="space-y-1 text-sm text-slate-300">
              <span className="text-xs uppercase tracking-wide text-slate-500">Branch</span>
              <select
                value={draft.branch}
                onChange={(e) => update('branch', e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {branchOptions.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-sm text-slate-300">
              <span className="text-xs uppercase tracking-wide text-slate-500">State</span>
              <select
                value={draft.state}
                onChange={(e) => update('state', e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {stateOptions.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-sm text-slate-300">
              <span className="text-xs uppercase tracking-wide text-slate-500">Radius ({draft.radius} mi)</span>
              <input
                type="range"
                min={1}
                max={25}
                value={draft.radius}
                onChange={(e) => {
                  const next = Number.parseInt(e.target.value, 10) || 1;
                  update('radius', next);
                }}
                className="w-full"
              />
            </label>

            <div className="space-y-2 text-sm text-slate-300">
              <span className="block text-xs uppercase tracking-wide text-slate-500">Must include</span>
              <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800">
                <input
                  type="checkbox"
                  checked={draft.requireHospital}
                  onChange={(e) => update('requireHospital', e.target.checked)}
                />
                <span>Hospital</span>
              </label>
              <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800">
                <input
                  type="checkbox"
                  checked={draft.requireVA}
                  onChange={(e) => update('requireVA', e.target.checked)}
                />
                <span>VA facility</span>
              </label>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-500 mb-2">
              <span>Amenities ({Object.values(draft.selectedCats).filter(Boolean).length} selected)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {categoryList.map((cat) => {
                const Icon = CATEGORY_META[cat].icon;
                return (
                  <label key={cat} className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${draft.selectedCats[cat] ? 'border-indigo-500 bg-indigo-500/5' : 'border-slate-800 bg-slate-950'}`}>
                    <input
                      type="checkbox"
                      checked={draft.selectedCats[cat]}
                      onChange={() => toggleCategory(cat)}
                    />
                    <Icon className="w-4 h-4" />
                    <span className="text-sm">{cat}</span>
                  </label>
                );
              })}
            </div>
            {!hasAmenitySelection && (
              <p className="mt-2 text-xs text-amber-400">Select at least one amenity to see results.</p>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-800 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-700 text-sm text-slate-200 hover:border-slate-500"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!hasAmenitySelection}
            onClick={() => onApply(draft)}
            className={`px-4 py-2 rounded-xl text-sm font-medium ${hasAmenitySelection ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}
          >
            Apply filters
          </button>
        </div>
      </div>
    </div>
  );
}
