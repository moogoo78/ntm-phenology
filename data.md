# Data: ntmPhenology combine (107-1 ~ 114-1)

Source file: `107-1_114-1_ntmPhenology_combine.完成清理之資料26.03.01.xlsx - Sheet1.csv`

## Column mapping (original → new name)

| # | Original header | New name | Notes |
|---|-----------------|----------|-------|
| 1 | (unnamed) | `inat_id` | iNaturalist observation id |
| 2 | scientific_name | `scientific_name` | 學名 |
| 3 | time_observed_at | `observed_at` | 觀測時間 (UTC) |
| 4 | quality_grade | `quality` | 品質等級 (casual / needs_id / research) |
| 5 | description | `description` | 描述 |
| 6 | url | `url` | iNaturalist 觀測網址 |
| 7 | file_name | `source_file` | 來源檔名 |
| 8 | field:你在哪？ | `site` | 觀測地點 |
| 9 | field:樹木編號 | `tree_id` | 樹木編號 |
| 10 | field:物候：萌蘗 | `annotation_sprout` | 物候 - 萌蘗 |
| 11 | field:物候：花 | `annotation_flower` | 物候 - 花 |
| 12 | field:物候：果 | `annotation_fruit` | 物候 - 果 |
| 13 | field:物候：葉 | `annotation_leaf` | 物候 - 葉 |
| 14 | field:物候：花：開花總數 | `annotation_flower_count` | 開花總數 |
| 15 | field:物候：花：開花的比例 | `annotation_flower_ratio` | 開花的比例 |
| 16 | field:物候：果：果實總數 | `annotation_fruit_count` | 果實總數 |
| 17 | field:物候：果：植株上的熟果比例 | `annotation_mature_fruit_ratio` | 植株上的熟果比例 |
| 18 | field:物候：葉：嫩葉佔樹冠比例 | `annotation_young_leaf_ratio` | 嫩葉佔樹冠比例 |
| 19 | field:物候：葉：變色葉佔樹冠比例 | `annotation_discolored_leaf_ratio` | 變色葉佔樹冠比例 |
| 20 | field:物候：葉：葉遮蔽面積比例 | `annotation_leaf_cover_ratio` | 葉遮蔽面積比例 |
| 21 | field:備註 | `note` | 備註 |

## New header row (CSV)

```
inat_id,scientific_name,observed_at,quality,description,url,source_file,site,tree_id,annotation_sprout,annotation_flower,annotation_fruit,annotation_leaf,annotation_flower_count,annotation_flower_ratio,annotation_fruit_count,annotation_mature_fruit_ratio,annotation_young_leaf_ratio,annotation_discolored_leaf_ratio,annotation_leaf_cover_ratio,note
```

## Sample row (schematic — no real data committed)

```
<inat_id>,<scientific_name>,<YYYY-MM-DD HH:MM:SS UTC>,<quality>,<description>,<url>,<source_file>,<site>,<tree_id>,<annotation_sprout>,<annotation_flower>,<annotation_fruit>,<annotation_leaf>,<flower_count>,<flower_ratio>,<fruit_count>,<mature_fruit_ratio>,<young_leaf_ratio>,<discolored_leaf_ratio>,<leaf_cover_ratio>,<note>
```

## DuckDB database

File: `ntmPhenology.duckdb` — table `phenology`.

- Built from `ntmPhenology_renamed.csv` (read with `parallel=false, strict_mode=false,
  null_padding=true` because some `description` fields contain quoted newlines).
- **17,150 rows** after removing 80 exact full-row duplicates (raw load was 17,230 records).
- All columns are `VARCHAR` **except** `observed_at`, which is a plain `TIMESTAMP`
  (UTC wall-clock, parsed from the `'%Y-%m-%d %H:%M:%S %Z'` strings; 104 rows have NULL
  because the source value was empty).
- Range: earliest `1970-01-19 13:46:42`, latest `2025-12-14 06:12:55`.
  - Note: the `1970-01-19` value (inat_id `64447779`) is bad data present in the source,
    left unchanged.
- `quality` distribution: casual 16,945 / research 173 / needs_id 112 (pre-dedupe counts).

Rebuild from scratch:

```sql
CREATE TABLE phenology AS
SELECT * EXCLUDE (observed_at),
       try_strptime(NULLIF(observed_at,''), '%Y-%m-%d %H:%M:%S %Z') AT TIME ZONE 'UTC' AS observed_at
FROM (SELECT DISTINCT * FROM read_csv('ntmPhenology_renamed.csv',
        header=true, delim=',', quote='"', escape='"',
        strict_mode=false, null_padding=true, parallel=false,
        sample_size=-1, all_varchar=true));
```
