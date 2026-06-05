# NTM Phenology charts

A small Flask website that visualizes the NTM phenology dataset
(`ntmPhenology.duckdb`, table `phenology`) — iNaturalist monitoring at two Taipei
parks (二二八公園 / 228 Park, 南門園區 / Nanmen), 248 species, 2018–2025, with
flower / fruit / leaf phenophase annotations.

## Charts (the 4 sections of `charts.md`)
1. **資料概況 Data Overview** — totals (records / trees / sites), annual stacked bar by
   year × site, site pie, monthly observations (optional split-by-site), and the
   **top-30** species ranking.
2. **一棵樹的一年故事 Individual Tree Story** — for one tree, monthly leaf-cover % + new-leaf %
   (left axis) and flowering / fruiting probability (right axis).
3. **物候月曆 Phenology Calendar** — 12 representative species × 12 months as a dot grid:
   ● flowering, ■ fruiting, ▲ new-leaf. A mark shows only past threshold (flower/fruit
   **> 30%**, new-leaf **> 15%**); symbol size scales with magnitude.
4. **跨年度趨勢 Crossed-year Trends** — 山櫻花 (Prunus campanulata) flowering rate as a
   year × month heatmap; each year's **peak month is outlined**; `2021*` flags a sparse year;
   blank rows = years observed but without flowering annotation (e.g. 2024–2025).

The top filter bar (species / site / year range) drives §1's charts; §2 has its own tree
selector and §3/§4 use fixed species. UI is bilingual (Chinese data terms, Latin species names).

## Run (development)

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python app.py
# open http://127.0.0.1:5000
```

## Run (production / your server)

The DuckDB connection is opened **read-only**, so multiple workers can share the file.

```bash
.venv/bin/pip install gunicorn
.venv/bin/gunicorn -w 4 -b 0.0.0.0:8000 app:app
```

Keep `ntmPhenology.duckdb` in the same directory as `app.py`. ECharts loads from a CDN,
so the server needs no build step but clients need internet access (or vendor the
`echarts.min.js` file locally and update the `<script>` tag in `templates/index.html`).

## API

All endpoints accept optional `species`, `site`, `from_year`, `to_year` query params
(empty = all). Time-based queries exclude one bad source timestamp (pre-2017).

| Endpoint | Returns |
|----------|---------|
| `GET /api/species` | distinct species + counts |
| `GET /api/summary` | totals, by-site, by-year, top-15 species (ignores `species` filter) |
| `GET /api/observations` | monthly counts; add `split_site=1` to break out by site |
| `GET /api/yearly_by_site` | per year × site counts (§1 annual bar; NULL site → 未指定) |
| `GET /api/trees` | trees with species + count (+ common_name from the map) |
| `GET /api/tree` | one tree × month: leaf-cover %, new-leaf %, flower/fruit prob (§2) |
| `GET /api/calendar` | 12 target species × month: flower rate, fruit rate, new-leaf % (§3) |
| `GET /api/year_month` | one species × year × month flowering rate + count (§4) |
| `GET /api/phenology` | per phenophase × month: `assessed` / `active` + value breakdown |

The 12 target species for §3 are defined in `TARGET_SPECIES` in `app.py`. Thresholds and
peak detection (§3/§4) are applied client-side in `static/app.js`.

### Phenophase math
Annotation columns distinguish `NULL` (*not assessed*) from `無` (*assessed, none present*).
The calendar uses **assessed = non-NULL** rows as the denominator and counts anything other
than `無` as **active**, so `% active = active / assessed`.

## Common names (optional)
The dataset has no common-name column. `common_names.json` is a `scientific_name -> common_name`
map (a template with all 214 tree species is included; fill in the values you want). It powers
the `[id  scientific_name  common_name]` labels in the **Individual tree story** dropdown.
Empty/missing entries simply fall back to `id  scientific_name`. The file is read once at
startup, so restart the server after editing it.

## Data prep
See `data.md` for the column rename map and how `ntmPhenology.duckdb` was built from the
source CSV (dedupe + `observed_at` → `TIMESTAMP`).
