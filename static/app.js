"use strict";

const MONTHS_ZH = ["1月", "2月", "3月", "4月", "5月", "6月",
                   "7月", "8月", "9月", "10月", "11月", "12月"];

// Site display labels + stable colors for the grouped bar chart.
const SITE_LABELS = {
  "二二八公園": "二二八公園 (228 Park)",
  "南門園區": "南門園區 (Nanmen)",
  "未指定": "未指定 (Unspecified)",
  "(NULL)": "(NULL)",
};
const SITE_COLORS = {
  "二二八公園": "#2f7d52", "南門園區": "#d8743f",
  "未指定": "#5a8fb5", "(NULL)": "#aab2ab",
};

// --- ECharts instances ---
const charts = {};
function chart(id) {
  if (!charts[id]) charts[id] = echarts.init(document.getElementById(id));
  return charts[id];
}
window.addEventListener("resize", () => Object.values(charts).forEach(c => c.resize()));

// --- filter state ---
const el = id => document.getElementById(id);
function filters() {
  return {
    species: el("species").value.trim(),
    site: el("site").value,
    from_year: el("from_year").value,
    to_year: el("to_year").value,
  };
}
function qs(extra = {}) {
  const f = { ...filters(), ...extra };
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) p.set(k, v);
  return p.toString();
}
const getJSON = url => fetch(url).then(r => r.json());

let detailKind = "flower";

// --- renderers ---
async function loadSpecies() {
  const rows = await getJSON("/api/species");
  const dl = el("species-list");
  dl.innerHTML = rows.map(r => `<option value="${r.scientific_name}">${r.n}</option>`).join("");
}

function fillYears() {
  const years = [];
  for (let y = 2018; y <= 2025; y++) years.push(y);
  el("from_year").innerHTML =
    `<option value="">earliest</option>` + years.map(y => `<option>${y}</option>`).join("");
  el("to_year").innerHTML =
    `<option value="">latest</option>` + years.map(y => `<option>${y}</option>`).join("");
}

async function loadSummary() {
  const d = await getJSON("/api/summary?" + qs({ species: "" }));
  const t = d.totals;
  el("cards").innerHTML = [
    [t.observations, "Observations 觀測"],
    [t.species, "Species 物種"],
    [t.trees, "Trees 樹木"],
  ].map(([n, l]) => `<div class="card"><div class="num">${(n || 0).toLocaleString()}</div><div class="lbl">${l}</div></div>`).join("");

  chart("chart-site").setOption({
    title: { text: "By site 依地點", left: "center", textStyle: { fontSize: 13 } },
    tooltip: { trigger: "item" },
    series: [{
      type: "pie", radius: ["40%", "70%"], center: ["50%", "56%"],
      data: d.by_site.map(r => ({ name: r.site, value: r.n })),
      label: { formatter: "{b}\n{c} ({d}%)" },
    }],
  }, true);

  const top = d.top_species.slice().reverse();
  chart("chart-top").setOption({
    grid: { left: 170, right: 30, top: 10, bottom: 20 },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    xAxis: { type: "value" },
    yAxis: { type: "category", data: top.map(r => r.scientific_name),
             axisLabel: { fontSize: 10 } },
    series: [{ type: "bar", data: top.map(r => r.n), itemStyle: { color: "#2f7d52" } }],
  }, true);
}

async function loadTrees() {
  const rows = await getJSON("/api/trees");
  el("tree").innerHTML = rows.map(r => {
    const label = [r.tree_id, r.scientific_name, r.common_name].filter(Boolean).join("  ");
    return `<option value="${r.tree_id}">${label}</option>`;
  }).join("");
  return rows;
}

async function loadTree() {
  const tree_id = el("tree").value.trim();
  if (!tree_id) { chart("chart-tree").clear(); return; }
  const d = await getJSON("/api/tree?tree_id=" + encodeURIComponent(tree_id));
  if (!d.months || !d.months.length) { chart("chart-tree").clear(); return; }

  const byM = Object.fromEntries(d.months.map(r => [r.m, r]));
  const pick = (key, scale = 1, dp = 1) => MONTHS_ZH.map((_, i) => {
    const r = byM[i + 1];
    const v = r ? r[key] : null;
    return v == null ? null : Math.round(v * scale * 10 ** dp) / 10 ** dp;
  });
  const leafCover = pick("leaf_cover");
  const youngLeaf = pick("young_leaf");
  const flowerProb = pick("flower_prob", 1, 2);
  const fruitProb = pick("fruit_prob", 1, 2);

  chart("chart-tree").setOption({
    title: {
      text: `一棵樹的一年故事：${d.scientific_name || "?"} (個體 ID: ${d.tree_id})`,
      left: "center", textStyle: { fontSize: 13 },
    },
    tooltip: { trigger: "axis" },
    legend: { top: 26 },
    grid: { left: 55, right: 58, top: 64, bottom: 30 },
    xAxis: { type: "category", data: MONTHS_ZH, name: "月份", nameLocation: "middle", nameGap: 26 },
    yAxis: [
      { type: "value", name: "葉片狀態 (%)", min: 0, max: 100, position: "left" },
      { type: "value", name: "花果機率 (Prob)", min: 0, max: 1, position: "right" },
    ],
    series: [
      {
        name: "總葉量覆蓋率 (%)", type: "line", yAxisIndex: 0, data: leafCover,
        smooth: true, symbol: "none", connectNulls: true, z: 1,
        lineStyle: { opacity: 0 },
        areaStyle: { color: "rgba(140, 192, 111, 0.35)" },
        itemStyle: { color: "rgba(140, 192, 111, 0.6)" },
      },
      {
        name: "新葉比例 (%)", type: "bar", yAxisIndex: 0, data: youngLeaf,
        barWidth: "45%", itemStyle: { color: "#8cc06f" }, z: 2,
      },
      {
        name: "開花機率", type: "line", yAxisIndex: 1, data: flowerProb,
        connectNulls: true, symbol: "circle", symbolSize: 7,
        lineStyle: { width: 3 }, itemStyle: { color: "#e1352f" }, z: 4,
      },
      {
        name: "結果機率", type: "line", yAxisIndex: 1, data: fruitProb,
        connectNulls: true, symbol: "rect", symbolSize: 7,
        lineStyle: { width: 2, type: "dashed" }, itemStyle: { color: "#e8922f" }, z: 3,
      },
    ],
  }, true);
}

async function loadYearlyBySite() {
  const rows = await getJSON("/api/yearly_by_site?" + qs({ site: "" }));
  const years = [...new Set(rows.map(r => r.year))].sort();
  const sites = [...new Set(rows.map(r => r.site))];
  const idx = Object.fromEntries(years.map((y, i) => [y, i]));
  const totals = new Array(years.length).fill(0);
  const series = sites.map(s => {
    const arr = new Array(years.length).fill(0);
    rows.filter(r => r.site === s).forEach(r => { arr[idx[r.year]] = r.n; });
    arr.forEach((v, i) => { totals[i] += v; });
    return {
      name: SITE_LABELS[s] || s, type: "bar", stack: "site", data: arr,
      itemStyle: { color: SITE_COLORS[s] || "#888" },
    };
  });
  // Zero-height series at the top of the stack: carries the total label per year.
  series.push({
    name: "total", type: "bar", stack: "site", data: years.map(() => 0),
    silent: true, tooltip: { show: false },
    label: {
      show: true, position: "top", fontWeight: "bold", color: "#243027",
      formatter: p => totals[p.dataIndex].toLocaleString(),
    },
  });
  chart("chart-yearly").setOption({
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    legend: { top: 0, data: sites.map(s => SITE_LABELS[s] || s) },
    grid: { left: 55, right: 20, top: 40, bottom: 30 },
    xAxis: { type: "category", data: years },
    yAxis: { type: "value", name: "觀測 obs" },
    series,
  }, true);
}

async function loadObservations() {
  const split = el("split-site").checked;
  const rows = await getJSON("/api/observations?" + qs({ split_site: split ? "1" : "" }));
  let option;
  if (split) {
    const months = [...new Set(rows.map(r => r.ym))].sort();
    const sites = [...new Set(rows.map(r => r.site))];
    const idx = Object.fromEntries(months.map((m, i) => [m, i]));
    const series = sites.map(s => {
      const arr = new Array(months.length).fill(0);
      rows.filter(r => r.site === s).forEach(r => { arr[idx[r.ym]] = r.n; });
      return { name: s, type: "bar", stack: "all", data: arr };
    });
    option = {
      tooltip: { trigger: "axis" }, legend: { top: 0 },
      grid: { left: 50, right: 20, top: 30, bottom: 60 },
      xAxis: { type: "category", data: months, axisLabel: { rotate: 90, fontSize: 9 } },
      yAxis: { type: "value" }, series,
    };
  } else {
    option = {
      tooltip: { trigger: "axis" },
      grid: { left: 50, right: 20, top: 20, bottom: 60 },
      xAxis: { type: "category", data: rows.map(r => r.ym), axisLabel: { rotate: 90, fontSize: 9 } },
      yAxis: { type: "value" },
      series: [{ type: "bar", data: rows.map(r => r.n), itemStyle: { color: "#5a8fb5" } }],
    };
  }
  chart("chart-obs").setOption(option, true);
}

// §3 Phenology calendar — 12 species × 12 months, dot-grid with thresholds.
// flower/fruit are 0-1 (threshold 0.30); leaf is avg % (threshold 15).
async function loadCalendar() {
  const d = await getJSON("/api/calendar");
  const yLabels = d.species.map(s => `${s.zh} ${s.sci}`);
  const yIndex = Object.fromEntries(d.species.map((s, i) => [s.sci, i]));
  const flower = [], fruit = [], leaf = [];
  d.rows.forEach(r => {
    const yi = yIndex[r.scientific_name];
    if (yi == null) return;
    if (r.flower != null && r.flower > 0.30) flower.push([r.m - 1, yi, Math.round(r.flower * 100)]);
    if (r.fruit != null && r.fruit > 0.30) fruit.push([r.m - 1, yi, Math.round(r.fruit * 100)]);
    if (r.leaf != null && r.leaf > 15) leaf.push([r.m - 1, yi, Math.round(r.leaf)]);
  });
  // Symbol size scales with magnitude (value is %, 0-100).
  const sized = (data, unit) => ({
    data, symbolSize: v => 10 + (v[2] / 100) * 18,
    tooltip: { formatter: p => `${yLabels[p.value[1]]}<br>${MONTHS_ZH[p.value[0]]} · ${p.seriesName}: ${p.value[2]}${unit}` },
  });
  chart("chart-calendar").setOption({
    tooltip: { trigger: "item" },
    legend: { top: 0, data: ["開花 Flower", "結果 Fruit", "新葉 New leaf"] },
    grid: { left: 150, right: 30, top: 36, bottom: 30 },
    xAxis: { type: "category", data: MONTHS_ZH, splitLine: { show: true } },
    yAxis: { type: "category", data: yLabels, axisLabel: { fontSize: 10 }, splitLine: { show: true } },
    series: [
      { name: "開花 Flower", type: "scatter", symbol: "circle", itemStyle: { color: "rgba(225,53,47,0.85)" }, ...sized(flower, "%") },
      { name: "結果 Fruit", type: "scatter", symbol: "rect", itemStyle: { color: "rgba(232,146,47,0.85)" }, ...sized(fruit, "%") },
      { name: "新葉 New leaf", type: "scatter", symbol: "triangle", itemStyle: { color: "rgba(140,192,111,0.9)" }, ...sized(leaf, "%") },
    ],
  }, true);
}

// §4 Crossed-year trend — 山櫻花 flowering rate heatmap, year × month, peak outlined.
async function loadTrend() {
  const d = await getJSON("/api/year_month?species=" + encodeURIComponent("Prunus campanulata"));
  const years = [...new Set(d.rows.map(r => r.y))].sort();
  const yIndex = Object.fromEntries(years.map((y, i) => [y, i]));
  // Peak month per year (only meaningful when that year has some flowering > 0).
  const peakMonth = {};
  years.forEach(y => {
    const yr = d.rows.filter(r => r.y === y && r.flower != null && r.flower > 0);
    if (yr.length) peakMonth[y] = yr.reduce((a, b) => (b.flower > a.flower ? b : a)).m;
  });
  const data = d.rows.filter(r => r.flower != null).map(r => {
    const val = Math.round(r.flower * 100);
    const isPeak = peakMonth[r.y] === r.m;
    return {
      value: [r.m - 1, yIndex[r.y], val],
      itemStyle: isPeak ? { borderColor: "#1a1a1a", borderWidth: 2.5 } : {},
    };
  });
  const yLabels = years.map(y => (y === 2021 ? "2021*" : String(y)));
  chart("chart-trend").setOption({
    tooltip: { position: "top", formatter: p => `${yLabels[p.value[1]]} · ${MONTHS_ZH[p.value[0]]}: ${p.value[2]}%` },
    grid: { left: 60, right: 30, top: 20, bottom: 60 },
    xAxis: { type: "category", data: MONTHS_ZH, splitArea: { show: true } },
    yAxis: { type: "category", data: yLabels, splitArea: { show: true } },
    visualMap: {
      min: 0, max: 100, calculable: true, orient: "horizontal", left: "center", bottom: 6,
      inRange: { color: ["#f4f8f1", "#bfe0ab", "#e8c23f", "#e8922f", "#e1352f"] },
      text: ["high", "low"],
    },
    series: [{
      name: "開花機率", type: "heatmap", data,
      label: { show: true, formatter: p => p.value[2], fontSize: 9 },
    }],
  }, true);
}

// --- wiring ---
function reloadAll() {
  loadSummary();
  loadYearlyBySite();
  loadObservations();
}

async function initTree() {
  const rows = await loadTrees();
  // Default to tree 3001 if present (the reference example), else the busiest tree.
  const def = rows.find(r => r.tree_id === "3001") || rows[0];
  if (def) { el("tree").value = def.tree_id; loadTree(); }
}

function init() {
  fillYears();
  loadSpecies();
  reloadAll();
  initTree();
  loadCalendar();   // §3 — fixed 12 species, independent of the filter bar
  loadTrend();      // §4 — fixed to 山櫻花
  el("tree").addEventListener("change", loadTree);

  ["species", "site", "from_year", "to_year"].forEach(id =>
    el(id).addEventListener("change", reloadAll));
  el("split-site").addEventListener("change", loadObservations);
  el("reset").addEventListener("click", () => {
    el("species").value = ""; el("site").value = "";
    el("from_year").value = ""; el("to_year").value = "";
    reloadAll();
  });
}

init();
