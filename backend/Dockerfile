FROM python:3.13-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py extensions.py .
COPY blueprints/ blueprints/
COPY utils/ utils/

RUN mkdir -p /data && \
    useradd -r -s /bin/false appuser && chown -R appuser /app /data
USER appuser

EXPOSE 5000

CMD ["gunicorn", "-w", "2", "-b", "0.0.0.0:5000", "--timeout", "30", "--access-logfile", "-", "--error-logfile", "-", "app:app"]
