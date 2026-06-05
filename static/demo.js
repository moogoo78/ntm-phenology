"use strict";

// Bilingual phenophase labels: Chinese value -> English. Legends show "中文 (English)".
const PHENO_LABELS = {
  flower: {
    "花枝出現": "Budding", "首次花開": "First bloom",
    "花開盛期": "Peak bloom", "花開間期": "Waning bloom",
  },
  fruit: {
    "未熟果": "Unripe", "首次果熟": "First ripe",
    "果熟盛期": "Peak ripe", "果熟間期": "Waning ripe",
  },
  leaf: {
    "落葉50%": "50% leaf fall", "葉片變色50%": "50% discolored",
    "葉片全部凋萎": "Fully withered",
  },
};
const PHASE_META = {
  flower: { name: "Flower 花", color: "#d8743f" },
  fruit:  { name: "Fruit 果",  color: "#7a4fb5" },
  leaf:   { name: "Leaf 葉",   color: "#2f7d52" },
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
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

function bil(kind, zh) {
  const en = (PHENO_LABELS[kind] || {})[zh];
  return en ? `${zh} (${en})` : zh;
}

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

  const top = d.top_species.slice(0, 15).reverse();
  chart("chart-top").setOption({
    title: { text: "Top 15 species", left: "center", textStyle: { fontSize: 13 } },
    grid: { left: 160, right: 30, top: 40, bottom: 20 },
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

async function loadPhenology() {
  const d = await getJSON("/api/phenology?" + qs());
  el("pheno-hint").textContent = filters().species
    ? `% of assessed observations of ${filters().species} showing activity, by month.`
    : "% of assessed observations showing activity, by month (all species). Pick a species for a single-species curve.";

  // Activity curve: one line per phenophase, % active by month.
  const series = Object.entries(PHASE_META).map(([k, meta]) => {
    const byM = Object.fromEntries((d[k].monthly || []).map(r => [r.m, r]));
    const data = MONTHS.map((_, i) => {
      const r = byM[i + 1];
      return r && r.assessed ? Math.round((r.active / r.assessed) * 1000) / 10 : 0;
    });
    return { name: meta.name, type: "line", smooth: true, data,
             lineStyle: { width: 3 }, itemStyle: { color: meta.color } };
  });
  chart("chart-pheno").setOption({
    tooltip: { trigger: "axis", valueFormatter: v => v + "%" },
    legend: { top: 0 },
    grid: { left: 50, right: 20, top: 35, bottom: 30 },
    xAxis: { type: "category", data: MONTHS, boundaryGap: false },
    yAxis: { type: "value", max: 100, axisLabel: { formatter: "{value}%" } },
    series,
  }, true);

  renderDetail(d);
  charts._lastPheno = d;
}

function renderDetail(d) {
  const k = detailKind;
  const rows = d[k].breakdown || [];
  const values = [...new Set(rows.map(r => r.value))];
  const series = values.map(v => {
    const arr = new Array(12).fill(0);
    rows.filter(r => r.value === v).forEach(r => { arr[r.m - 1] = r.n; });
    return { name: bil(k, v), type: "bar", stack: "all", data: arr };
  });
  chart("chart-pheno-detail").setOption({
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    legend: { top: 0 },
    grid: { left: 50, right: 20, top: 35, bottom: 30 },
    xAxis: { type: "category", data: MONTHS },
    yAxis: { type: "value" },
    series,
  }, true);
}

// --- wiring ---
function reloadAll() {
  loadSummary();
  loadYearlyBySite();
  loadObservations();
  loadPhenology();
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
  el("tree").addEventListener("change", loadTree);

  ["species", "site", "from_year", "to_year"].forEach(id =>
    el(id).addEventListener("change", reloadAll));
  el("split-site").addEventListener("change", loadObservations);
  el("reset").addEventListener("click", () => {
    el("species").value = ""; el("site").value = "";
    el("from_year").value = ""; el("to_year").value = "";
    reloadAll();
  });
  document.querySelectorAll("#pheno-seg button").forEach(b =>
    b.addEventListener("click", () => {
      detailKind = b.dataset.k;
      document.querySelectorAll("#pheno-seg button").forEach(x => x.classList.remove("active"));
      b.classList.add("active");
      if (charts._lastPheno) renderDetail(charts._lastPheno);
    }));
}

init();
