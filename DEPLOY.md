# Deploying NTM Phenology (Docker)

Production runs the Flask app under **gunicorn** in a single container. The DuckDB
data file is **mounted at runtime** (not baked into the image), and **ECharts is vendored**
under `static/vendor/` (no CDN dependency). You front the container with your own reverse
proxy (nginx / Caddy / Traefik).

## 1. Build + run with docker compose (recommended)

Copy the repo to the host. The `.duckdb` file does *not* need to be in the build context —
it is mounted at runtime. Point the host paths at your data via a `.env` file next to
`docker-compose.yml`:

```ini
# .env
NTM_DB_FILE=/srv/ntm/ntmPhenology.duckdb
NTM_COMMON_NAMES_FILE=/srv/ntm/common_names.json
```

Then:

```bash
docker compose up -d --build
```

`compose` publishes `127.0.0.1:8000`, mounts both files read-only, sets `restart: unless-stopped`,
and inherits the image `HEALTHCHECK`. Defaults (if you skip `.env`) mount `./ntmPhenology.duckdb`
and `./common_names.json` from the repo — handy for a local smoke test.

Check health:

```bash
curl -s localhost:8000/healthz                 # {"status":"ok","rows":17150}
docker compose ps                              # STATUS shows "(healthy)"
```

Edit `common_names.json` on the host, then `docker compose restart` to pick it up — no rebuild.

## 1b. Behind an existing Traefik (no host port)

If the host already runs Traefik (docker provider) — e.g. alongside the galaxy-catalog
stack — use the `compose.traefik.yml` override instead of publishing a port. Traefik
reaches the app over its shared network and issues TLS automatically.

`.env` needs the public hostname (DNS must resolve to the host; with a Cloudflare
DNS-challenge resolver the record must live in that Cloudflare account):

```ini
NTM_HOST=phenology.example.org
NTM_DB_FILE=/root/ntm-phenology/ntmPhenology.duckdb
```

```bash
docker compose -f docker-compose.yml -f compose.traefik.yml up -d --build
```

The override joins the external `galaxy-catalog_default` network and adds
`traefik.*` labels (router `ntm`, `websecure` entrypoint, `myresolver` cert,
service port 8000). Adjust the network name in `compose.traefik.yml` if your
Traefik lives on a different network.

## 2. Alternative: plain `docker run`

```bash
docker build -t ntm-phenology .
docker run -d --name ntm-phenology --restart unless-stopped \
  -p 127.0.0.1:8000:8000 \
  -v /srv/ntm/ntmPhenology.duckdb:/data/ntmPhenology.duckdb:ro \
  ntm-phenology
```

The app reads `NTM_DB_PATH` (default `/data/ntmPhenology.duckdb`, set in the Dockerfile).

## 3. Reverse proxy (example: nginx on the host)

```nginx
server {
    listen 443 ssl;
    server_name phenology.example.org;
    # ssl_certificate / ssl_certificate_key ...

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

The two pages are `/` (current charts) and `/demo` (previous version).

## 4. Updating

- **Code/charts:** rebuild the image and `docker compose up -d` / `docker run` the new tag.
- **Data:** replace the mounted `.duckdb` on the host and `docker restart ntm-phenology`
  (the read-only connection is opened at worker startup).

## Notes / tuning

- `-w 3` worker processes × `--threads 2`. DuckDB is opened **read-only**, so multiple
  workers share the mounted file safely. Set `-w` to roughly `2 × CPU cores`.
- Each worker opens its own read-only DuckDB connection at startup; queries within a worker
  are serialized by a lock (fine at this data size).
- No secrets, no write paths, no DB credentials — the container only needs read access to
  the mounted `.duckdb`.
- Local dev without Docker still works: `.venv/bin/python app.py` (see `README.md`), or
  run gunicorn directly: `.venv/bin/gunicorn -w 3 -k gthread --threads 2 -b 0.0.0.0:8000 app:app`.
