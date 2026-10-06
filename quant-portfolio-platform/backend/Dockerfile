# Build context is the repository root, because the API imports the quant package:
#   docker build -f backend/Dockerfile -t quant-api .
FROM python:3.11-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Install dependencies first so a code change does not reinstall SciPy.
COPY pyproject.toml README.md ./
COPY quant ./quant
RUN pip install --no-cache-dir ".[api,data,postgres]"

COPY backend ./backend
COPY jobs ./jobs
COPY database ./database

# The app is importable as `app.*` from /app/backend, and `quant.*` from /app.
ENV PYTHONPATH=/app:/app/backend

# Run as a non-root user; give it the SQLite directory in case no Postgres is configured.
RUN useradd --create-home --uid 10001 appuser \
    && mkdir -p /app/backend/data \
    && chown -R appuser:appuser /app/backend/data
USER appuser

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=5 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4).status == 200 else 1)"

# One worker by default: the in-process rate limiter and the price cache are
# per-process, so scale with replicas behind a shared limiter rather than with
# --workers if you need more throughput.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--app-dir", "/app/backend"]
