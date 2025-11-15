import React, { useEffect, useMemo, useState } from "react";
import BASES from './bases.json';
import AMENITIES from './amenities.json';

import {
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
  branchFilters: [...(filters.branchFilters || [])],
  stateFilters: [...(filters.stateFilters || [])],
  baseFilters: [...(filters.baseFilters || [])],
  selectedCats: { ...filters.selectedCats }
});

export default function MilitaryBasesDashboard() {
  const [branchFilters, setBranchFilters] = useState([]);
  const [stateFilters, setStateFilters] = useState([]);
  const [baseFilters, setBaseFilters] = useState([]);
  const [radius, setRadius] = useState(10);
  const [selectedCats, setSelectedCats] = useState(() => buildCategoryState());
  const [requireHospital, setRequireHospital] = useState(false);
  const [requireVA, setRequireVA] = useState(false);
  const [sortBy, setSortBy] = useState({ key: "name", dir: "asc" });
  const [filtersModalOpen, setFiltersModalOpen] = useState(true);
  const [filtersApplied, setFiltersApplied] = useState(false);
  const [detailSelection, setDetailSelection] = useState(null);

  // ----------- OPTIONS: state (2-letter caps, dedup) & branch (case-sensitive) -----------
  const stateOptions = useMemo(() => {
    const m = new Set();
    for (const b of BASES) {
      if (b.state) m.add(normState(b.state));
    }
    return ["All", ...Array.from(m).sort()];
  }, []);

  const branchOptions = useMemo(() => ["All", ...unique(BASES.map((b) => b.branch)).sort()], []);
  const baseOptions = useMemo(
    () =>
      BASES.map((b) => ({
        id: b.id,
        label: b.name,
        subtitle: [b.city, normState(b.state)].filter(Boolean).join(", ")
      })),
    []
  );
  const baseLookup = useMemo(() => {
    const map = {};
    for (const b of BASES) map[b.id] = b;
    return map;
  }, []);

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

  const filtered = useMemo(
    () =>
      BASES.filter((b) => {
        if (branchFilters.length > 0 && !branchFilters.includes(b.branch)) return false;
        if (stateFilters.length > 0 && !stateFilters.includes(normState(b.state))) return false;
        if (baseFilters.length > 0 && !baseFilters.includes(b.id)) return false;
        if (requireHospital && perBaseStats[b.id].counts["Hospital"] < 1) return false;
        if (requireVA && perBaseStats[b.id].counts["VA"] < 1) return false;
        return true;
      }),
    [branchFilters, stateFilters, baseFilters, requireHospital, requireVA, perBaseStats]
  );

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
  const currentFilters = useMemo(
    () => ({
      branchFilters,
      stateFilters,
      baseFilters,
      radius,
      requireHospital,
      requireVA,
      selectedCats
    }),
    [branchFilters, stateFilters, baseFilters, radius, requireHospital, requireVA, selectedCats]
  );

  const filtersReady = filtersApplied && activeCategories.length > 0;
  const exportDisabled = !filtersReady || sorted.length === 0;
  const filtersPrompt = !filtersApplied
    ? "Open Filters to choose the locations and amenities you care about."
    : "Select at least one amenity to display results.";

  const detailData = useMemo(() => {
    if (!detailSelection) return null;
    if (!selectedCats[detailSelection.category]) return null;
    const base = baseLookup[detailSelection.baseId];
    if (!base) return null;
    const locationLabel = [base.city, normState(base.state)].filter(Boolean).join(", ") || "Unknown";
    const amenities = (amenitiesByBase[base.id] || [])
      .filter((a) => {
        if (a.category !== detailSelection.category) return false;
        const d = milesDistance(base.lat, base.lon, a.lat, a.lon);
        return d <= radius;
      })
      .map((a) => {
        const miles = typeof a.distanceMiles === "number"
          ? a.distanceMiles
          : milesDistance(base.lat, base.lon, a.lat, a.lon);
        return { ...a, distanceMiles: Number(miles.toFixed(2)) };
      })
      .sort((a, b) => (a.distanceMiles ?? 0) - (b.distanceMiles ?? 0));

    return {
      base,
      category: detailSelection.category,
      locationLabel,
      amenities
    };
  }, [detailSelection, amenitiesByBase, radius, selectedCats, baseLookup]);

  useEffect(() => {
    if (!detailSelection) return;
    const baseStillVisible = filtered.some((b) => b.id === detailSelection.baseId);
    const categoryActive = !!selectedCats[detailSelection.category];
    if (!baseStillVisible || !categoryActive) {
      setDetailSelection(null);
    }
  }, [filtered, detailSelection, selectedCats]);

  function handleApplyFilters(next) {
    setBranchFilters([...next.branchFilters]);
    setStateFilters([...next.stateFilters]);
    setBaseFilters([...next.baseFilters]);
    setRadius(next.radius);
    setRequireHospital(next.requireHospital);
    setRequireVA(next.requireVA);
    setSelectedCats({ ...next.selectedCats });
    setFiltersModalOpen(false);
    setFiltersApplied(true);
    setDetailSelection(null);
  }

  function handleCellClick(base, category) {
    setDetailSelection({ baseId: base.id, category });
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
        <div className="px-4 py-4 flex items-center gap-4">
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

      <section className="px-4 py-4 space-y-3">
        <div className="flex flex-wrap gap-2 lg:items-center">
          <div className="inline-flex h-11 items-center gap-3 px-4 rounded-xl border border-slate-800 bg-slate-900/60 max-w-full">
            <span className="text-xs uppercase tracking-wide text-slate-400">Filters</span>
            {activeCategories.length > 0 ? (
              <div className="flex-1 text-xs text-slate-100 truncate">
                {activeCategories.join(", ")}
              </div>
            ) : (
              <span className="text-xs text-slate-500">None selected</span>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-2 lg:w-auto">
            <button
              type="button"
              onClick={() => setFiltersModalOpen(true)}
              className="inline-flex h-11 items-center justify-center gap-2 px-4 rounded-xl bg-slate-800 border border-slate-700 hover:border-indigo-500 hover:text-indigo-200 transition"
            >
              <Filter className="w-4 h-4" />
              <span className="text-sm">Filters</span>
            </button>
            <button
              type="button"
              onClick={exportCSV}
              disabled={exportDisabled}
              className={`inline-flex h-11 items-center justify-center gap-2 px-4 rounded-xl shadow-sm ${
                exportDisabled ? "bg-slate-800 text-slate-500 cursor-not-allowed" : "bg-indigo-600 hover:bg-indigo-500"
              }`}
            >
              <Download className="w-4 h-4" />
              <span className="text-sm">Export CSV</span>
            </button>
          </div>
        </div>
      </section>

      {/* Data table section with centered, non-overlapping sticky header and compact columns */}
      <section className="px-4 pb-10">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1 rounded-2xl border border-slate-800 shadow-xl bg-slate-900 overflow-hidden">
            {filtersReady ? (
              <div className="overflow-x-auto lg:overflow-x-hidden">
                <table className="w-full text-sm table-fixed text-[13px]">
                  <colgroup>
                    <col className="w-[320px]" />
                    <col className="w-[140px]" />
                    <col className="w-[72px]" />
                    {activeCategories.map((_, i) => (
                      <col key={i} className={COMPACT_CAT_W} />
                    ))}
                  </colgroup>

                  <thead className="sticky top-0 z-20 bg-slate-900">
                    <tr className="text-left text-slate-300">
                      <Th label="Base" now={sortBy} k="name" onSort={setSort} />
                      <Th label="Branch" now={sortBy} k="branch" onSort={setSort} />
                      <Th label="State" now={sortBy} k="state" onSort={setSort} />
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
                          <td className="px-2 py-3 align-top text-center">{normState(b.state)}</td>

                          {activeCategories.map((c) => {
                            const Icon = CATEGORY_META[c].icon;
                            const count = stats.counts[c] || 0;
                            const isActiveDetail =
                              detailSelection && detailSelection.baseId === b.id && detailSelection.category === c;
                            return (
                              <td key={c} className="px-2 py-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleCellClick(b, c)}
                                  className={`w-full inline-flex items-center justify-center gap-1 px-2 py-1 rounded-full text-[11px] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                                    count > 0 ? "bg-slate-800 text-slate-100" : "bg-slate-900 text-slate-500 border border-slate-800"
                                  } ${isActiveDetail ? "ring-2 ring-indigo-400" : ""}`}
                                  aria-label={`Show ${count} ${c} amenities near ${b.name}`}
                                >
                                  <Icon className="w-3.5 h-3.5" />
                                  <span className="tabular-nums">{count}</span>
                                </button>
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
              <div className="p-10 text-center text-slate-400">{filtersPrompt}</div>
            )}
          </div>

          <div className="lg:w-96 rounded-2xl border border-slate-800 bg-slate-950/40 p-4 space-y-4">
            {detailData ? (
              <>
                <div className="flex items-start gap-3">
                  {CATEGORY_META[detailData.category]?.icon && (
                    <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
                      {React.createElement(CATEGORY_META[detailData.category].icon, {
                        className: "w-5 h-5 text-indigo-300"
                      })}
                    </div>
                  )}
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">{detailData.category}</p>
                    <p className="text-base font-semibold text-slate-100">{detailData.base.name}</p>
                    <p className="text-xs text-slate-400">{detailData.locationLabel}</p>
                  </div>
                </div>
                <div className="text-sm text-slate-300">
                  {detailData.amenities.length > 0
                    ? `${detailData.amenities.length} result${detailData.amenities.length === 1 ? "" : "s"} within ${radius} miles.`
                    : `No ${detailData.category.toLowerCase()} within ${radius} miles.`}
                </div>
                <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                  {detailData.amenities.length > 0 ? (
                    detailData.amenities.map((a) => (
                      <div key={a.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-3 text-sm">
                        <p className="font-medium text-slate-100">{a.name || `${detailData.category} option`}</p>
                        <p className="text-xs text-slate-400">
                          {typeof a.distanceMiles === "number" ? `${a.distanceMiles.toFixed(1)} mi away` : "Distance unavailable"}
                        </p>
                        {a.address && <p className="text-xs text-slate-500 mt-1">{a.address}</p>}
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-500">Try increasing the radius to find nearby locations.</p>
                  )}
                </div>
              </>
            ) : (
              <div className="text-sm text-slate-400">
                Click any amenity count to view the specific locations that make up that number.
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
        baseOptions={baseOptions}
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

function FilterModal({ open, initialFilters, stateOptions, branchOptions, baseOptions, categoryList, onApply, onClose }) {
  const [draft, setDraft] = useState(() => cloneFilterState(initialFilters));
  const branchChoices = useMemo(() => branchOptions.filter((opt) => opt !== "All"), [branchOptions]);
  const stateChoices = useMemo(() => stateOptions.filter((opt) => opt !== "All"), [stateOptions]);
  const [branchCandidate, setBranchCandidate] = useState("");
  const [stateCandidate, setStateCandidate] = useState("");
  const [baseCandidate, setBaseCandidate] = useState("");

  useEffect(() => {
    if (open) {
      setDraft(cloneFilterState(initialFilters));
      setBranchCandidate(branchChoices[0] ?? "");
      setStateCandidate(stateChoices[0] ?? "");
      setBaseCandidate(baseOptions[0]?.id ?? "");
    }
  }, [open, initialFilters, branchChoices, stateChoices, baseOptions]);

  if (!open) return null;

  const update = (field, value) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
  };

  const addValue = (field, value) => {
    if (!value) return;
    setDraft((prev) => {
      const nextList = prev[field] || [];
      if (nextList.includes(value)) return prev;
      return { ...prev, [field]: [...nextList, value] };
    });
  };

  const removeValue = (field, value) => {
    setDraft((prev) => ({
      ...prev,
      [field]: (prev[field] || []).filter((item) => item !== value)
    }));
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
          <div className="space-y-6">
            <div className="space-y-2 text-sm text-slate-300">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wide text-slate-500">Branches</span>
                <button
                  type="button"
                  className="text-xs text-indigo-300 hover:text-indigo-100"
                  onClick={() => setDraft((prev) => ({ ...prev, branchFilters: [] }))}
                >
                  Clear
                </button>
              </div>
              <div className="flex gap-2">
                <select
                  value={branchCandidate}
                  onChange={(e) => setBranchCandidate(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select branch</option>
                  {branchChoices.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => addValue("branchFilters", branchCandidate)}
                  className="px-3 py-2 rounded-xl bg-indigo-600 text-sm"
                >
                  Add
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {(draft.branchFilters || []).map((value) => (
                  <span key={value} className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-700 text-xs">
                    {value}
                    <button type="button" onClick={() => removeValue("branchFilters", value)} className="text-slate-400 hover:text-white">
                      ×
                    </button>
                  </span>
                ))}
                {(!draft.branchFilters || draft.branchFilters.length === 0) && (
                  <span className="text-xs text-slate-500">All branches</span>
                )}
              </div>
            </div>

            <div className="space-y-2 text-sm text-slate-300">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wide text-slate-500">States</span>
                <button
                  type="button"
                  className="text-xs text-indigo-300 hover:text-indigo-100"
                  onClick={() => setDraft((prev) => ({ ...prev, stateFilters: [] }))}
                >
                  Clear
                </button>
              </div>
              <div className="flex gap-2">
                <select
                  value={stateCandidate}
                  onChange={(e) => setStateCandidate(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select state</option>
                  {stateChoices.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => addValue("stateFilters", stateCandidate)}
                  className="px-3 py-2 rounded-xl bg-indigo-600 text-sm"
                >
                  Add
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {(draft.stateFilters || []).map((value) => (
                  <span key={value} className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-700 text-xs">
                    {value}
                    <button type="button" onClick={() => removeValue("stateFilters", value)} className="text-slate-400 hover:text-white">
                      ×
                    </button>
                  </span>
                ))}
                {(!draft.stateFilters || draft.stateFilters.length === 0) && (
                  <span className="text-xs text-slate-500">All states</span>
                )}
              </div>
            </div>

            <div className="space-y-2 text-sm text-slate-300">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wide text-slate-500">Bases</span>
                <button
                  type="button"
                  className="text-xs text-indigo-300 hover:text-indigo-100"
                  onClick={() => setDraft((prev) => ({ ...prev, baseFilters: [] }))}
                >
                  Clear
                </button>
              </div>
              <div className="flex gap-2">
                <select
                  value={baseCandidate}
                  onChange={(e) => setBaseCandidate(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select base</option>
                  {baseOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => addValue("baseFilters", baseCandidate)}
                  className="px-3 py-2 rounded-xl bg-indigo-600 text-sm"
                >
                  Add
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {(draft.baseFilters || []).map((value) => {
                  const info = baseOptions.find((opt) => opt.id === value);
                  return (
                    <span key={value} className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-700 text-xs">
                      {info?.label || value}
                      <button type="button" onClick={() => removeValue("baseFilters", value)} className="text-slate-400 hover:text-white">
                        ×
                      </button>
                    </span>
                  );
                })}
                {(!draft.baseFilters || draft.baseFilters.length === 0) && (
                  <span className="text-xs text-slate-500">All bases</span>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
