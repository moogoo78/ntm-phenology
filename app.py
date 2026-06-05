"""NTM Phenology charts website — Flask backend over the DuckDB dataset.

Serves one HTML page plus JSON API endpoints that aggregate the `phenology`
table in ntmPhenology.duckdb. The connection is opened read-only so multiple
WSGI workers can share the file safely.
"""
import json
import os
import threading

import duckdb
from flask import Flask, jsonify, render_template, request

HERE = os.path.dirname(__file__)
# Paths are env-overridable so production can mount the data elsewhere
# (e.g. NTM_DB_PATH=/data/ntmPhenology.duckdb for a Docker volume).
DB_PATH = os.environ.get("NTM_DB_PATH") or os.path.join(HERE, "ntmPhenology.duckdb")
COMMON_NAMES_PATH = os.environ.get("NTM_COMMON_NAMES") or os.path.join(HERE, "common_names.json")
# Bad source timestamp (inat_id 64447779 -> 1970); ignore it in time queries.
MIN_DATE = "2017-01-01"

app = Flask(__name__)

# Optional scientific_name -> common_name map (the dataset has no common-name
# column). Edit common_names.json to fill these in; missing/empty values are fine.
try:
    with open(COMMON_NAMES_PATH, encoding="utf-8") as _f:
        COMMON_NAMES = {k: v for k, v in json.load(_f).items() if v}
except FileNotFoundError:
    COMMON_NAMES = {}

# A single read-only connection shared across requests. DuckDB connections are
# not thread-safe, so serialize access with a lock and use a fresh cursor per
# query. Read-only + short queries keep contention negligible at this data size.
_con = duckdb.connect(DB_PATH, read_only=True)
_lock = threading.Lock()


def query(sql, params=None):
    """Run a parameterized query, returning a list of dict rows."""
    with _lock:
        cur = _con.cursor()
        cur.execute(sql, params or [])
        cols = [d[0] for d in cur.description]
        rows = cur.fetchall()
    return [dict(zip(cols, r)) for r in rows]


def build_filters(species=None, site=None, from_year=None, to_year=None, time_bound=True):
    """Build a WHERE clause + params from optional filters. Empty == all."""
    clauses, params = [], []
    if time_bound:
        clauses.append("observed_at >= ?")
        params.append(MIN_DATE)
    if species:
        clauses.append("scientific_name = ?")
        params.append(species)
    if site:
        clauses.append("site = ?")
        params.append(site)
    if from_year:
        clauses.append("year(observed_at) >= ?")
        params.append(int(from_year))
    if to_year:
        clauses.append("year(observed_at) <= ?")
        params.append(int(to_year))
    where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
    return where, params


@app.route("/healthz")
def healthz():
    """Liveness/readiness probe — confirms the DB is reachable. Used by Docker HEALTHCHECK."""
    try:
        n = query("SELECT count(*) AS n FROM phenology")[0]["n"]
        return {"status": "ok", "rows": n}
    except Exception as exc:  # pragma: no cover - defensive
        return {"status": "error", "detail": str(exc)}, 500


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/demo")
def demo():
    """Independent sandbox copy of the current dashboard (templates/demo.html +
    static/demo.js). Shares the same API; edit the demo files to iterate freely."""
    return render_template("demo.html")


@app.route("/api/species")
def api_species():
    """Distinct species with observation counts, for the dropdown."""
    rows = query(
        "SELECT scientific_name, count(*) AS n FROM phenology "
        "WHERE scientific_name IS NOT NULL "
        "GROUP BY scientific_name ORDER BY n DESC"
    )
    return jsonify(rows)


@app.route("/api/summary")
def api_summary():
    """Totals, per-site counts, per-year counts, top-15 species.

    Respects site + year filters (species filter is ignored here on purpose —
    the summary is an overview across species).
    """
    site = request.args.get("site") or None
    from_year = request.args.get("from_year") or None
    to_year = request.args.get("to_year") or None
    where, params = build_filters(site=site, from_year=from_year, to_year=to_year)

    totals = query(
        "SELECT count(*) AS observations, "
        "count(DISTINCT scientific_name) AS species, "
        "count(DISTINCT tree_id) AS trees FROM phenology" + where,
        params,
    )[0]
    by_site = query(
        "SELECT coalesce(site, '(NULL)') AS site, count(*) AS n FROM phenology"
        + where + " GROUP BY site ORDER BY n DESC",
        params,
    )
    by_year = query(
        "SELECT year(observed_at) AS year, count(*) AS n FROM phenology"
        + where + " GROUP BY year ORDER BY year",
        params,
    )
    top_species = query(
        "SELECT scientific_name, count(*) AS n FROM phenology"
        + where + " GROUP BY scientific_name ORDER BY n DESC LIMIT 30",
        params,
    )
    return jsonify(
        {"totals": totals, "by_site": by_site, "by_year": by_year, "top_species": top_species}
    )


@app.route("/api/observations")
def api_observations():
    """Monthly observation counts (time series), optionally split by site."""
    species = request.args.get("species") or None
    site = request.args.get("site") or None
    from_year = request.args.get("from_year") or None
    to_year = request.args.get("to_year") or None
    split_site = request.args.get("split_site") == "1"
    where, params = build_filters(species, site, from_year, to_year)

    if split_site:
        rows = query(
            "SELECT strftime(observed_at, '%Y-%m') AS ym, "
            "coalesce(site, '(NULL)') AS site, count(*) AS n FROM phenology"
            + where + " GROUP BY ym, site ORDER BY ym",
            params,
        )
    else:
        rows = query(
            "SELECT strftime(observed_at, '%Y-%m') AS ym, count(*) AS n FROM phenology"
            + where + " GROUP BY ym ORDER BY ym",
            params,
        )
    return jsonify(rows)


@app.route("/api/yearly_by_site")
def api_yearly_by_site():
    """每年觀察紀錄 — per-year observation counts split by site.

    Respects species + year-range filters; ignores the site filter so all sites
    are always shown side by side.
    """
    species = request.args.get("species") or None
    from_year = request.args.get("from_year") or None
    to_year = request.args.get("to_year") or None
    where, params = build_filters(species=species, from_year=from_year, to_year=to_year)
    # Merge NULL site into '未指定' (unspecified) so exactly the 3 sites show.
    rows = query(
        "SELECT year(observed_at) AS year, coalesce(site, '未指定') AS site, "
        "count(*) AS n FROM phenology" + where + " GROUP BY year, site ORDER BY year",
        params,
    )
    return jsonify(rows)


# Which categorical column backs each phenophase.
PHENO_COLS = {"flower": "annotation_flower", "fruit": "annotation_fruit", "leaf": "annotation_leaf"}

# 12 representative species for the phenology calendar (§3) — (scientific, 中文名).
TARGET_SPECIES = [
    ("Prunus campanulata", "山櫻花"), ("Bombax ceiba", "木棉"),
    ("Liquidambar formosana", "楓香"), ("Melia azedarach", "苦楝"),
    ("Koelreuteria elegans", "台灣欒樹"), ("Delonix regia", "鳳凰木"),
    ("Cinnamomum camphora", "樟樹"), ("Lagerstroemia subcostata", "九芎"),
    ("Dillenia indica", "第倫桃"), ("Ternstroemia gymnanthera", "厚皮香"),
    ("Quercus glauca", "青剛櫟"), ("Cassia fistula", "阿勃勒"),
]

# Reusable SQL fragments: flowering / fruiting active fraction (0-1).
_FLOWER_RATE = (
    "count(*) FILTER (WHERE annotation_flower IS NOT NULL AND annotation_flower <> '無')::double "
    "/ nullif(count(*) FILTER (WHERE annotation_flower IS NOT NULL), 0)"
)
_FRUIT_RATE = (
    "count(*) FILTER (WHERE annotation_fruit IS NOT NULL AND annotation_fruit <> '無')::double "
    "/ nullif(count(*) FILTER (WHERE annotation_fruit IS NOT NULL), 0)"
)


@app.route("/api/calendar")
def api_calendar():
    """§3 Phenology calendar — for the 12 target species, per month-of-year:
    flowering rate, fruiting rate (0-1), and avg new-leaf % (banded -> midpoint).
    Thresholds are applied client-side.
    """
    yl = RATIO_MIDPOINT.format(col="annotation_young_leaf_ratio")
    names = [s for s, _ in TARGET_SPECIES]
    placeholders = ",".join(["?"] * len(names))
    rows = query(
        f"SELECT scientific_name, month(observed_at) AS m, "
        f"{_FLOWER_RATE} AS flower, {_FRUIT_RATE} AS fruit, avg({yl}) AS leaf "
        f"FROM phenology WHERE observed_at >= ? AND scientific_name IN ({placeholders}) "
        f"GROUP BY scientific_name, m",
        [MIN_DATE] + names,
    )
    return jsonify({"species": [{"sci": s, "zh": z} for s, z in TARGET_SPECIES], "rows": rows})


@app.route("/api/year_month")
def api_year_month():
    """§4 Crossed-year trend — per year x month flowering rate for one species
    (default 山櫻花 / Prunus campanulata), with the row count for sparse-year flags.
    """
    species = request.args.get("species") or "Prunus campanulata"
    rows = query(
        f"SELECT year(observed_at) AS y, month(observed_at) AS m, "
        f"{_FLOWER_RATE} AS flower, count(*) AS n "
        f"FROM phenology WHERE observed_at >= ? AND scientific_name = ? "
        f"GROUP BY y, m ORDER BY y, m",
        [MIN_DATE, species],
    )
    return jsonify({"species": species, "rows": rows})

# The ratio columns hold banded categories ('6-25%', '>95%', ...), not numbers.
# Map each band to a representative midpoint % so they can be averaged. '未記錄'
# (not recorded) and anything unexpected -> NULL (excluded from the average).
RATIO_MIDPOINT = (
    "CASE {col} "
    "WHEN '0%' THEN 0 WHEN '≦5%' THEN 2.5 WHEN '6-25%' THEN 15.5 "
    "WHEN '26-50%' THEN 38 WHEN '51-75%' THEN 63 WHEN '76-95%' THEN 85.5 "
    "WHEN '>95%' THEN 97.5 ELSE NULL END"
)


@app.route("/api/trees")
def api_trees():
    """Individual trees with their species + observation count, for the selector."""
    rows = query(
        "SELECT tree_id, any_value(scientific_name) AS scientific_name, count(*) AS n "
        "FROM phenology WHERE tree_id IS NOT NULL AND tree_id <> '' "
        "GROUP BY tree_id ORDER BY tree_id"
    )
    for r in rows:
        r["common_name"] = COMMON_NAMES.get(r["scientific_name"], "")
    return jsonify(rows)


@app.route("/api/tree")
def api_tree():
    """一棵樹的一年故事 — for one tree, per month-of-year:
    avg leaf-cover % and young-leaf % (from banded ratios -> midpoints), plus
    flowering / fruiting probability (active assessed fraction, 0-1).
    """
    tree_id = request.args.get("tree_id") or None
    if not tree_id:
        return jsonify({"tree_id": None, "scientific_name": None, "months": []})
    lc = RATIO_MIDPOINT.format(col="annotation_leaf_cover_ratio")
    yl = RATIO_MIDPOINT.format(col="annotation_young_leaf_ratio")
    months = query(
        f"SELECT month(observed_at) AS m, "
        f"avg({lc}) AS leaf_cover, avg({yl}) AS young_leaf, "
        f"count(*) FILTER (WHERE annotation_flower IS NOT NULL AND annotation_flower <> '無')::double "
        f"  / nullif(count(*) FILTER (WHERE annotation_flower IS NOT NULL), 0) AS flower_prob, "
        f"count(*) FILTER (WHERE annotation_fruit IS NOT NULL AND annotation_fruit <> '無')::double "
        f"  / nullif(count(*) FILTER (WHERE annotation_fruit IS NOT NULL), 0) AS fruit_prob, "
        f"count(*) AS n "
        f"FROM phenology WHERE tree_id = ? AND observed_at >= ? "
        f"GROUP BY m ORDER BY m",
        [tree_id, MIN_DATE],
    )
    sp = query(
        "SELECT any_value(scientific_name) AS sp FROM phenology WHERE tree_id = ?", [tree_id]
    )
    return jsonify(
        {"tree_id": tree_id, "scientific_name": sp[0]["sp"] if sp else None, "months": months}
    )


@app.route("/api/phenology")
def api_phenology():
    """Per phenophase (flower/fruit/leaf) x month-of-year (1-12):
    `assessed` = non-NULL rows, `active` = non-NULL and not '無'.
    Plus a per-value breakdown of the specific phenophase categories.
    """
    species = request.args.get("species") or None
    site = request.args.get("site") or None
    from_year = request.args.get("from_year") or None
    to_year = request.args.get("to_year") or None
    where, params = build_filters(species, site, from_year, to_year)

    result = {}
    for key, col in PHENO_COLS.items():
        monthly = query(
            f"SELECT month(observed_at) AS m, "
            f"count(*) FILTER (WHERE {col} IS NOT NULL) AS assessed, "
            f"count(*) FILTER (WHERE {col} IS NOT NULL AND {col} <> '無') AS active "
            f"FROM phenology{where} GROUP BY m ORDER BY m",
            params,
        )
        bd_where = where + (" AND " if where else " WHERE ") + f"{col} IS NOT NULL AND {col} <> '無'"
        breakdown = query(
            f"SELECT month(observed_at) AS m, {col} AS value, count(*) AS n "
            f"FROM phenology{bd_where} GROUP BY m, value ORDER BY m",
            params,
        )
        result[key] = {"monthly": monthly, "breakdown": breakdown}
    return jsonify(result)


if __name__ == "__main__":
    app.run(debug=True, port=5000)
