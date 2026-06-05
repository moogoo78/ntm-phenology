# NTM Phenology — production image (gunicorn). Data is NOT baked in; mount the
# DuckDB file at runtime (see DEPLOY.md). ECharts is vendored under static/vendor.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    NTM_DB_PATH=/data/ntmPhenology.duckdb

WORKDIR /app

# Install deps first for better layer caching.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# App code + assets (no data file — it is volume-mounted).
COPY app.py .
COPY common_names.json .
COPY templates/ templates/
COPY static/ static/

# Run as a non-root user.
RUN useradd --create-home --uid 10001 appuser && chown -R appuser /app
USER appuser

EXPOSE 8000

# Liveness probe hits /healthz (confirms the DB is reachable).
HEALTHCHECK --interval=30s --timeout=4s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/healthz').status==200 else 1)"

# 3 worker processes, 2 threads each. DuckDB is opened read-only, so workers
# share the mounted file safely. Tune -w to ~ (2 * CPU cores).
CMD ["gunicorn", "-w", "3", "-k", "gthread", "--threads", "2", \
     "-b", "0.0.0.0:8000", "--access-logfile", "-", "app:app"]
