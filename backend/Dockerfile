FROM python:3.13-slim AS builder

WORKDIR /build

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt --target=/install

FROM python:3.13-slim

WORKDIR /app

COPY --from=builder /install /usr/local/lib/python3.13/site-packages/
ENV PATH="/usr/local/lib/python3.13/site-packages/bin:$PATH"

COPY app.py extensions.py .
COPY blueprints/ blueprints/
COPY utils/ utils/

RUN mkdir -p /data && \
    useradd -r -s /bin/false appuser && chown -R appuser /app /data
USER appuser

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:5000/api/health')" || exit 1

CMD ["gunicorn", "-w", "2", "-b", "0.0.0.0:5000", "--timeout", "30", "--access-logfile", "-", "--error-logfile", "-", "app:app"]
