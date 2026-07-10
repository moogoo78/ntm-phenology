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
    [t.trees, "樹木個體數"],
    [t.sites, "觀察地點"],
  ].map(([n, l]) => `<div class="card"><div class="num">${(n || 0).toLocaleString()}</div><div class="lbl">${l}</div></div>`).join("");

  chart("chart-site").setOption({
    title: { text: "By site 依地點", left: "center", textStyle: { fontSize: 13 } },
    tooltip: { trigger: "item" },
    series: [{
      type: "pie", radius: ["40%", "70%"], center: ["50%", "56%"],
      data: d.by_site.map(r => ({
        name: r.site, value: r.n,
        itemStyle: { color: SITE_COLORS[r.site] || "#888" },
      })),
      label: { formatter: "{b}\n{c} ({d}%)" },
    }],
  }, true);

  const top = d.top_species.slice().reverse();
  chart("chart-top").setOption({
    grid: { left: 240, right: 30, top: 10, bottom: 20 },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    xAxis: { type: "value" },
    yAxis: { type: "category",
             data: top.map(r => r.common_name ? `${r.scientific_name} (${r.common_name})` : r.scientific_name),
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
// flower/fruit are 0-1 ratios (compared as %); leaf is avg %. Thresholds are
// user-selectable via #cal-threshold ("<flower/fruit %>,<leaf %>").
let calData = null;
async function loadCalendar() {
  calData = await getJSON("/api/calendar");
  el("cal-threshold").addEventListener("change", renderCalendar);
  renderCalendar();
}

function renderCalendar() {
  const d = calData;
  if (!d) return;
  const [ffMin, leafMin] = (el("cal-threshold").value || "30,15").split(",").map(Number);
  // Axis: common name on its own line above the (italic) scientific name so
  // long labels wrap instead of overflowing the grid. Tooltip keeps one line.
  const yData = d.species.map(s => (s.zh ? `${s.zh}\n{sci|${s.sci}}` : `{sci|${s.sci}}`));
  const yLabels = d.species.map(s => `${s.zh} ${s.sci}`.trim());
  const yIndex = Object.fromEntries(d.species.map((s, i) => [s.sci, i]));
  const flower = [], fruit = [], leaf = [];
  d.rows.forEach(r => {
    const yi = yIndex[r.scientific_name];
    if (yi == null) return;
    if (r.flower != null && r.flower * 100 > ffMin) flower.push([r.m - 1, yi, Math.round(r.flower * 100)]);
    if (r.fruit != null && r.fruit * 100 > ffMin) fruit.push([r.m - 1, yi, Math.round(r.fruit * 100)]);
    if (r.leaf != null && r.leaf > leafMin) leaf.push([r.m - 1, yi, Math.round(r.leaf)]);
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
    yAxis: { type: "category", data: yData, splitLine: { show: true },
      axisLabel: {
        fontSize: 11, lineHeight: 14,
        rich: { sci: { fontSize: 9, fontStyle: "italic", color: "#667", lineHeight: 13 } },
      } },
    series: [
      { name: "開花 Flower", type: "scatter", symbol: "circle", itemStyle: { color: "rgba(225,53,47,0.85)" }, ...sized(flower, "%") },
      { name: "結果 Fruit", type: "scatter", symbol: "rect", itemStyle: { color: "rgba(232,146,47,0.85)" }, ...sized(fruit, "%") },
      { name: "新葉 New leaf", type: "scatter", symbol: "triangle", itemStyle: { color: "rgba(140,192,111,0.9)" }, ...sized(leaf, "%") },
    ],
  }, true);
}

// §4 Crossed-year trend — flowering rate heatmap, year × month, peak outlined.
// step2.md #1: species is now selectable (preset list + all species).
const TREND_PRESET = [
  ["Prunus campanulata", "山櫻花"], ["Bischofia javanica", "茄苳"],
  ["Millettia pinnata", "水黃皮"], ["Bauhinia × blakeana", "洋紫荊"],
  ["Keteleeria davidiana formosana", "臺灣油杉"], ["Ternstroemia gymnanthera", "厚皮香"],
  ["Quercus glauca", "青剛櫟"], ["Acer buergerianum", "臺灣三角楓"],
  ["Acer serrulatum", "青楓"], ["Magnolia compressa", "烏心石"],
];
async function initTrend() {
  const all = await getJSON("/api/species");
  const preset = new Set(TREND_PRESET.map(p => p[0]));
  const presetOpts = TREND_PRESET
    .map(([sci, zh]) => `<option value="${sci}">${zh} ${sci}</option>`).join("");
  const restOpts = all.filter(r => !preset.has(r.scientific_name))
    .map(r => `<option value="${r.scientific_name}">${r.scientific_name} (${r.n})</option>`).join("");
  el("trend-species").innerHTML =
    `<optgroup label="step2 重點物種">${presetOpts}</optgroup>` +
    `<optgroup label="其他 All species">${restOpts}</optgroup>`;
  el("trend-species").value = "Prunus campanulata";
  loadTrend();
}
async function loadTrend() {
  const sp = el("trend-species") ? el("trend-species").value : "Prunus campanulata";
  const d = await getJSON("/api/year_month?species=" + encodeURIComponent(sp));
  const years = [...new Set(d.rows.map(r => r.y))].sort();
  const yIndex = Object.fromEntries(years.map((y, i) => [y, i]));
  const yLabels = years.map(y => (y === 2021 ? "2021*" : String(y)));
  const ctx = { rows: d.rows, years, yIndex, yLabels };
  // flower/fruit are 0-1 probabilities (→ %); leaf is already an avg %.
  trendHeatmap("chart-trend", ctx, "flower", `${sp} — 年 × 月 開花機率 (%)`, v => Math.round(v * 100));
  trendHeatmap("chart-trend-fruit", ctx, "fruit", `${sp} — 年 × 月 結果機率 (%)`, v => Math.round(v * 100));
  trendHeatmap("chart-trend-leaf", ctx, "leaf", `${sp} — 年 × 月 新葉比例 (%)`, v => Math.round(v));
}

// One year×month heatmap for a given metric; each year's peak month is outlined.
function trendHeatmap(id, ctx, key, title, toPct) {
  const { rows, years, yIndex, yLabels } = ctx;
  const peakMonth = {};
  years.forEach(y => {
    const yr = rows.filter(r => r.y === y && r[key] != null && r[key] > 0);
    if (yr.length) peakMonth[y] = yr.reduce((a, b) => (b[key] > a[key] ? b : a)).m;
  });
  const data = rows.filter(r => r[key] != null).map(r => {
    const isPeak = peakMonth[r.y] === r.m;
    return {
      value: [r.m - 1, yIndex[r.y], toPct(r[key])],
      itemStyle: isPeak ? { borderColor: "#1a1a1a", borderWidth: 2.5 } : {},
    };
  });
  chart(id).setOption({
    title: { text: title, left: "center", textStyle: { fontSize: 13 } },
    tooltip: { position: "top", formatter: p => `${yLabels[p.value[1]]} · ${MONTHS_ZH[p.value[0]]}: ${p.value[2]}%` },
    grid: { left: 60, right: 30, top: 44, bottom: 60 },
    xAxis: { type: "category", data: MONTHS_ZH, splitArea: { show: true } },
    yAxis: { type: "category", data: yLabels, splitArea: { show: true } },
    visualMap: {
      min: 0, max: 100, calculable: false, orient: "horizontal", left: "center", bottom: 6,
      inRange: { color: ["#f4f8f1", "#bfe0ab", "#e8c23f", "#e8922f", "#e1352f"] },
      text: ["high", "low"],
    },
    series: [{
      name: title, type: "heatmap", data,
      label: { show: true, formatter: p => p.value[2], fontSize: 9 },
    }],
  }, true);
}

// §5 跨樣區比較 — one species, monthly flower/fruit rate per site (228 vs 南門).
const SC_COLORS = { "二二八公園": "#2f7d52", "南門園區": "#d8743f" };
async function initSiteCompare() {
  const d = await getJSON("/api/site_compare");
  el("sc-species").innerHTML = d.options
    .map(o => `<option value="${o.sci}">${o.zh} ${o.sci}</option>`).join("");
  el("sc-species").value = d.species;
  loadSiteCompare();
}
async function loadSiteCompare() {
  const sp = el("sc-species").value;
  const d = await getJSON("/api/site_compare?species=" + encodeURIComponent(sp));
  const byKey = {};
  d.rows.forEach(r => { byKey[`${r.site}|${r.m}`] = r; });
  const series = [];
  d.sites.forEach(site => {
    const flower = MONTHS_ZH.map((_, i) => {
      const r = byKey[`${site}|${i + 1}`];
      return r && r.flower != null ? Math.round(r.flower * 100) : null;
    });
    const fruit = MONTHS_ZH.map((_, i) => {
      const r = byKey[`${site}|${i + 1}`];
      return r && r.fruit != null ? Math.round(r.fruit * 100) : null;
    });
    const c = SC_COLORS[site] || "#888";
    series.push({
      name: `${site} 開花`, type: "line", data: flower, connectNulls: true,
      symbol: "circle", symbolSize: 6, lineStyle: { width: 3 }, itemStyle: { color: c },
    });
    series.push({
      name: `${site} 結果`, type: "line", data: fruit, connectNulls: true,
      symbol: "rect", symbolSize: 6, lineStyle: { width: 2, type: "dashed" }, itemStyle: { color: c },
    });
  });
  chart("chart-sitecmp").setOption({
    title: { text: `${sp} — 跨樣區月物候率 (%)`, left: "center", textStyle: { fontSize: 13 } },
    tooltip: { trigger: "axis", valueFormatter: v => (v == null ? "—" : v + "%") },
    legend: { top: 26 },
    grid: { left: 50, right: 25, top: 64, bottom: 30 },
    xAxis: { type: "category", data: MONTHS_ZH, name: "月份", nameLocation: "middle", nameGap: 26 },
    yAxis: { type: "value", name: "率 (%)", min: 0, max: 100 },
    series,
  }, true);
}

// §6 初花日 FFD — earliest open-flower DOY per year for one species.
async function initFFD() {
  const rows = await getJSON("/api/flower_species");
  el("ffd-species").innerHTML = rows
    .map(r => `<option value="${r.scientific_name}">${r.scientific_name} (${r.n})</option>`).join("");
  const def = rows.find(r => r.scientific_name === "Prunus campanulata") || rows[0];
  if (def) el("ffd-species").value = def.scientific_name;
  loadFFD();
}
async function loadFFD() {
  const sp = el("ffd-species").value;
  const d = await getJSON("/api/ffd?species=" + encodeURIComponent(sp));
  const data = d.rows.map(r => ({
    value: [String(r.y), r.doy],
    itemStyle: r.n < 3 ? { color: "#bbb" } : {},
    first_date: r.first_date, n: r.n,
  }));
  // approximate month gridlines on the DOY axis
  const monthDOY = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
  chart("chart-ffd").setOption({
    title: { text: `${sp} — 初花日 First Flowering Date`, left: "center", textStyle: { fontSize: 13 } },
    tooltip: {
      trigger: "item",
      formatter: p => `${p.value[0]}<br>DOY ${p.value[1]} (${p.data.first_date})<br>records: ${p.data.n}`,
    },
    grid: { left: 70, right: 25, top: 44, bottom: 40 },
    xAxis: { type: "category", data: d.rows.map(r => String(r.y)), name: "年", nameLocation: "middle", nameGap: 26 },
    yAxis: {
      type: "value", name: "DOY (越低越早)", min: 1, max: 366, inverse: false,
      splitLine: { show: true },
      axisLabel: {
        formatter: v => {
          const m = monthDOY.findIndex((d2, i) => v >= d2 && (i === 11 || v < monthDOY[i + 1]));
          return m >= 0 && monthDOY[m] === v ? `${v} (${m + 1}月)` : v;
        },
      },
    },
    series: [{
      type: "line", data, connectNulls: true, symbol: "circle", symbolSize: 10,
      lineStyle: { width: 2, color: "#c0533f" }, itemStyle: { color: "#c0533f" },
      label: { show: true, position: "top", formatter: p => p.value[1], fontSize: 9 },
    }],
  }, true);
  loadPhenoScatter();
}

// §6 companion — DOY × Year scatter of every phenophase record, coloured by
// "trait". Each raw annotation value maps to a display label + colour; the order
// here also fixes the legend / plotting order.
const PHENO_TRAIT = {
  "首次花開": { label: "開花 open flower", color: "#e8503a" },
  "花開盛期": { label: "開花 open flower", color: "#e8503a" },
  "花開間期": { label: "開花 open flower", color: "#e8503a" },
  "花枝出現": { label: "花苞 flower bud", color: "#e07be0" },
  "未熟果": { label: "未熟果 unripe fruit", color: "#35b58a" },
  "首次果熟": { label: "熟果 ripe fruit", color: "#e8922f" },
  "果熟盛期": { label: "熟果 ripe fruit", color: "#e8922f" },
  "果熟間期": { label: "熟果 ripe fruit", color: "#e8922f" },
  "葉片變色50%": { label: "變色葉 senescing leaf", color: "#b0a12f" },
  "落葉50%": { label: "落葉 leaf fall", color: "#9c6b3f" },
  "葉片全部凋萎": { label: "凋萎 withered", color: "#8a8f98" },
};
// Legend order = the order traits first appear above.
const PHENO_TRAIT_ORDER = [...new Set(Object.values(PHENO_TRAIT).map(t => t.label))];

// Deterministic ±jitter in [-0.34, 0.34] so a point keeps its x on every reload.
function jitterX(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return ((h >>> 0) % 1000 / 1000 - 0.5) * 0.68;
}

async function loadPhenoScatter() {
  const d = await getJSON("/api/pheno_scatter?species=" + encodeURIComponent(el("ffd-species").value));
  const zh = d.zh || "";
  const years = d.rows.map(r => r.y);
  const minY = years.length ? Math.min(...years) : 2018;
  const maxY = years.length ? Math.max(...years) : 2025;
  const monthDOY = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
  // Bucket the flat rows into one scatter series per trait label.
  const buckets = new Map(PHENO_TRAIT_ORDER.map(l => [l, []]));
  d.rows.forEach(r => {
    const t = PHENO_TRAIT[r.raw];
    if (!t) return;
    const x = r.y + jitterX(`${r.tree_id}|${r.d}|${r.raw}`);
    buckets.get(t.label).push({ value: [x, r.doy], d: r.d, tree_id: r.tree_id, raw: r.raw, year: r.y });
  });
  const series = PHENO_TRAIT_ORDER.map(label => ({
    name: label, type: "scatter", symbolSize: 8,
    itemStyle: { color: Object.values(PHENO_TRAIT).find(t => t.label === label).color, opacity: 0.62 },
    data: buckets.get(label),
  }));
  chart("chart-pheno-scatter").setOption({
    title: {
      text: `${zh ? zh + " " : ""}${d.species} — DOY × Year 物候散布`,
      left: "center", textStyle: { fontSize: 13 },
    },
    tooltip: {
      trigger: "item",
      formatter: p => {
        const o = p.data;
        return `${zh ? "樹種: " + zh + "<br>" : ""}學名: ${d.species}<br>` +
          `個體: ${o.tree_id || "—"}<br>日期: ${o.d}<br>Year: ${o.year}<br>` +
          `DOY: ${o.value[1]}<br>Trait: ${p.seriesName}<br>原始值: ${o.raw}`;
      },
    },
    legend: { bottom: 0, type: "scroll", data: PHENO_TRAIT_ORDER },
    grid: { left: 66, right: 25, top: 44, bottom: 56 },
    xAxis: {
      type: "value", name: "年 Year", nameLocation: "middle", nameGap: 26,
      min: minY - 0.5, max: maxY + 0.5, interval: 1,
      axisLabel: { formatter: v => String(Math.round(v)) },
      splitLine: { show: true },
    },
    yAxis: {
      type: "value", name: "Day of year (DOY)", min: 1, max: 366,
      splitLine: { show: true },
      axisLabel: {
        formatter: v => {
          const m = monthDOY.findIndex((d2, i) => v >= d2 && (i === 11 || v < monthDOY[i + 1]));
          return m >= 0 && monthDOY[m] === v ? `${v} (${m + 1}月)` : v;
        },
      },
    },
    series,
  }, true);
}

// §7 熱帶 vs 溫帶 — group monthly avg leaf-cover (solid) + flower rate (dashed).
async function loadGroupSeasonality() {
  const d = await getJSON("/api/group_seasonality");
  const series = [];
  d.groups.forEach(g => {
    const byM = Object.fromEntries(g.rows.map(r => [r.m, r]));
    const leaf = MONTHS_ZH.map((_, i) => {
      const r = byM[i + 1]; return r && r.leaf != null ? Math.round(r.leaf) : null;
    });
    const flower = MONTHS_ZH.map((_, i) => {
      const r = byM[i + 1]; return r && r.flower != null ? Math.round(r.flower * 100) : null;
    });
    series.push({
      name: `${g.label} · 葉量`, type: "line", data: leaf, connectNulls: true, smooth: true,
      symbol: "circle", symbolSize: 6, lineStyle: { width: 3 }, itemStyle: { color: g.color },
    });
    series.push({
      name: `${g.label} · 開花`, type: "line", data: flower, connectNulls: true,
      symbol: "triangle", symbolSize: 7, lineStyle: { width: 2, type: "dashed" }, itemStyle: { color: g.color },
    });
  });
  el("group-legend").innerHTML = d.groups
    .map(g => `<span style="color:${g.color};font-weight:700">●</span> ${g.label}: ` +
              g.species.map(s => `${s.zh}`).join("、")).join(" &nbsp;|&nbsp; ");
  chart("chart-group").setOption({
    tooltip: { trigger: "axis", valueFormatter: v => (v == null ? "—" : v + "%") },
    legend: { top: 0, type: "scroll" },
    grid: { left: 50, right: 25, top: 56, bottom: 30 },
    xAxis: { type: "category", data: MONTHS_ZH, name: "月份", nameLocation: "middle", nameGap: 26 },
    yAxis: { type: "value", name: "% (葉量 / 開花)", min: 0, max: 100 },
    series,
  }, true);
}

// §8 特殊物候 — bimodal-flowering candidates as a month heatmap, peaks starred.
async function loadDoubleFlower() {
  const d = await getJSON("/api/double_flower");
  const cands = d.candidates;
  const yLabels = cands.map(c => (c.zh ? `${c.zh} ${c.sci}` : c.sci));
  const data = [];
  cands.forEach((c, yi) => {
    c.rate.forEach((v, mi) => { if (v != null) data.push([mi, yi, v]); });
  });
  const peaks = [];
  cands.forEach((c, yi) => c.peaks.forEach(m => peaks.push([m - 1, yi, "★"])));
  const h = Math.max(360, cands.length * 30 + 80);
  el("chart-double").style.height = h + "px";
  chart("chart-double").resize();
  chart("chart-double").setOption({
    tooltip: {
      position: "top",
      formatter: p => `${yLabels[p.value[1]]}<br>${MONTHS_ZH[p.value[0]]}: ${p.value[2]}%`,
    },
    grid: { left: 170, right: 30, top: 16, bottom: 70 },
    xAxis: { type: "category", data: MONTHS_ZH, splitArea: { show: true } },
    yAxis: { type: "category", data: yLabels, axisLabel: { fontSize: 10 }, splitArea: { show: true } },
    visualMap: {
      min: 0, max: 100, calculable: true, orient: "horizontal", left: "center", bottom: 6,
      inRange: { color: ["#f4f8f1", "#bfe0ab", "#e8c23f", "#e8922f", "#e1352f"] },
      text: ["high", "low"],
    },
    series: [
      { name: "開花率", type: "heatmap", data, label: { show: true, formatter: p => p.value[2], fontSize: 9 } },
      {
        name: "peak", type: "scatter", data: peaks, symbolSize: 1, z: 5,
        label: { show: true, formatter: "★", color: "#1a1a1a", fontSize: 12,
                 position: "top", distance: 2 },
        tooltip: { show: false },
      },
    ],
  }, true);
}

// §9 細緻 一棵樹的一年 (2024-2025) — all 5 series are % on one axis.
async function initTreeFine() {
  const rows = await getJSON("/api/trees?fine=1");
  el("tree-fine").innerHTML = rows.map(r => {
    const label = [r.tree_id, r.scientific_name, r.common_name].filter(Boolean).join("  ");
    return `<option value="${r.tree_id}">${label}</option>`;
  }).join("");
  const def = rows.find(r => r.tree_id === "0102") || rows[0];
  if (def) { el("tree-fine").value = def.tree_id; loadTreeFine(); }
}
async function loadTreeFine() {
  const tree_id = el("tree-fine").value.trim();
  if (!tree_id) { chart("chart-tree-fine").clear(); return; }
  const d = await getJSON("/api/tree_fine?tree_id=" + encodeURIComponent(tree_id));
  if (!d.months || !d.months.length) { chart("chart-tree-fine").clear(); return; }
  const byM = Object.fromEntries(d.months.map(r => [r.m, r]));
  const pick = key => MONTHS_ZH.map((_, i) => {
    const r = byM[i + 1]; const v = r ? r[key] : null;
    return v == null ? null : Math.round(v);
  });
  chart("chart-tree-fine").setOption({
    title: { text: `細緻 (2024–25)：${d.scientific_name || "?"} (個體 ID: ${d.tree_id})`,
             left: "center", textStyle: { fontSize: 13 } },
    tooltip: { trigger: "axis", valueFormatter: v => (v == null ? "—" : v + "%") },
    legend: { top: 26, type: "scroll" },
    grid: { left: 55, right: 25, top: 64, bottom: 30 },
    xAxis: { type: "category", data: MONTHS_ZH, name: "月份", nameLocation: "middle", nameGap: 26 },
    yAxis: { type: "value", name: "比例 (%)", min: 0, max: 100 },
    series: [
      { name: "總葉量覆蓋率", type: "line", data: pick("leaf_cover"), smooth: true,
        symbol: "none", connectNulls: true, z: 1, lineStyle: { opacity: 0 },
        areaStyle: { color: "rgba(140,192,111,0.30)" }, itemStyle: { color: "rgba(140,192,111,0.6)" } },
      { name: "新葉", type: "bar", data: pick("young_leaf"), barWidth: "40%",
        itemStyle: { color: "#8cc06f" }, z: 2 },
      { name: "變色葉", type: "line", data: pick("discolored"), connectNulls: true,
        symbol: "diamond", symbolSize: 7, lineStyle: { width: 2 }, itemStyle: { color: "#c79a3f" }, z: 3 },
      { name: "開花率", type: "line", data: pick("flower"), connectNulls: true,
        symbol: "circle", symbolSize: 7, lineStyle: { width: 3 }, itemStyle: { color: "#e1352f" }, z: 5 },
      { name: "成熟果率", type: "line", data: pick("fruit"), connectNulls: true,
        symbol: "rect", symbolSize: 7, lineStyle: { width: 2, type: "dashed" }, itemStyle: { color: "#e8922f" }, z: 4 },
    ],
  }, true);
}

// §10 細緻 物候月曆 (2024-2025) — dot grid, 4 phenophases from ratio columns.
async function loadCalendarFine() {
  const d = await getJSON("/api/calendar_fine");
  // Two-line axis labels (common name over italic scientific name); tooltip one line.
  const yData = d.species.map(s => (s.zh ? `${s.zh}\n{sci|${s.sci}}` : `{sci|${s.sci}}`));
  const yLabels = d.species.map(s => `${s.zh} ${s.sci}`.trim());
  const yIndex = Object.fromEntries(d.species.map((s, i) => [s.sci, i]));
  const flower = [], fruit = [], leaf = [], disc = [];
  d.rows.forEach(r => {
    const yi = yIndex[r.scientific_name];
    if (yi == null) return;
    if (r.flower != null && r.flower > 30) flower.push([r.m - 1, yi, Math.round(r.flower)]);
    if (r.fruit != null && r.fruit > 30) fruit.push([r.m - 1, yi, Math.round(r.fruit)]);
    if (r.leaf != null && r.leaf > 15) leaf.push([r.m - 1, yi, Math.round(r.leaf)]);
    if (r.discolored != null && r.discolored > 15) disc.push([r.m - 1, yi, Math.round(r.discolored)]);
  });
  const sized = data => ({
    data, symbolSize: v => 10 + (v[2] / 100) * 18,
    tooltip: { formatter: p => `${yLabels[p.value[1]]}<br>${MONTHS_ZH[p.value[0]]} · ${p.seriesName}: ${p.value[2]}%` },
  });
  chart("chart-calendar-fine").setOption({
    tooltip: { trigger: "item" },
    legend: { top: 0, data: ["開花 Flower", "成熟果 Fruit", "新葉 New leaf", "變色葉 Discolored"] },
    grid: { left: 150, right: 30, top: 36, bottom: 30 },
    xAxis: { type: "category", data: MONTHS_ZH, splitLine: { show: true } },
    yAxis: { type: "category", data: yData, splitLine: { show: true },
      axisLabel: {
        fontSize: 11, lineHeight: 14,
        rich: { sci: { fontSize: 9, fontStyle: "italic", color: "#667", lineHeight: 13 } },
      } },
    series: [
      { name: "開花 Flower", type: "scatter", symbol: "circle", itemStyle: { color: "rgba(225,53,47,0.85)" }, ...sized(flower) },
      { name: "成熟果 Fruit", type: "scatter", symbol: "rect", itemStyle: { color: "rgba(232,146,47,0.85)" }, ...sized(fruit) },
      { name: "新葉 New leaf", type: "scatter", symbol: "triangle", itemStyle: { color: "rgba(140,192,111,0.9)" }, ...sized(leaf) },
      { name: "變色葉 Discolored", type: "scatter", symbol: "diamond", itemStyle: { color: "rgba(199,154,63,0.9)" }, ...sized(disc) },
    ],
  }, true);
}

// --- tab navigation ---
function showTab(id) {
  if (!document.getElementById(id)) return;
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.toggle("active", p.id === id));
  document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("active", b.dataset.tab === id));
  if (location.hash !== "#" + id) history.replaceState(null, "", "#" + id);
  // charts created while hidden have zero size; resize once visible.
  requestAnimationFrame(() => Object.values(charts).forEach(c => c.resize()));
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
  initTrend();      // §4 — species-selectable (step2 #1)
  initSiteCompare();        // §5
  initFFD();               // §6
  loadGroupSeasonality();  // §7
  loadDoubleFlower();      // §8
  initTreeFine();          // §9  (step2 #2)
  loadCalendarFine();      // §10 (step2 #2)
  el("tree").addEventListener("change", loadTree);
  el("trend-species").addEventListener("change", loadTrend);
  el("sc-species").addEventListener("change", loadSiteCompare);
  el("ffd-species").addEventListener("change", loadFFD);
  el("tree-fine").addEventListener("change", loadTreeFine);

  // §2 / §3 data-scope toggle: swap the standard chart for the 2024–2025 fine
  // version. Charts built while hidden need a resize once their pane is shown.
  const paneToggle = (sel, allPane, finePane, allChart, fineChart) =>
    el(sel).addEventListener("change", () => {
      const fine = el(sel).value === "fine";
      el(allPane).style.display = fine ? "none" : "";
      el(finePane).style.display = fine ? "" : "none";
      requestAnimationFrame(() => chart(fine ? fineChart : allChart).resize());
    });
  paneToggle("tree-mode", "tree-pane-all", "tree-pane-fine", "chart-tree", "chart-tree-fine");
  paneToggle("cal-mode", "cal-pane-all", "cal-pane-fine", "chart-calendar", "chart-calendar-fine");

  ["species", "site", "from_year", "to_year"].forEach(id =>
    el(id).addEventListener("change", reloadAll));
  el("split-site").addEventListener("change", loadObservations);
  el("reset").addEventListener("click", () => {
    el("species").value = ""; el("site").value = "";
    el("from_year").value = ""; el("to_year").value = "";
    reloadAll();
  });

  document.querySelectorAll("#tabs button").forEach(b =>
    b.addEventListener("click", () => showTab(b.dataset.tab)));
  if (location.hash) showTab(location.hash.slice(1));
}

init();
