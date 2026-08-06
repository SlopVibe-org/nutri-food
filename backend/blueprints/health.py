"""Health check blueprint: /api/health and /api/health/backup."""
import json
import os
from pathlib import Path
from flask import Blueprint, jsonify

bp = Blueprint('health', __name__)

BACKUP_DIR = Path(os.environ.get("BACKUP_DIR", "/data/backups"))


@bp.route('/api/health', methods=['GET'])
def health():
    """Basic liveness probe."""
    return jsonify({'status': 'ok', 'service': 'nutrifood-api'})


@bp.route('/api/health/backup', methods=['GET'])
def health_backup():
    """Return metadata about the most recent backup.

    Reads the .last_backup metadata file written by scripts/backup_db.py.
    Response:
        200 — {"status": "ok", "last_backup": {...}, "backup_dir_exists": true}
        200 — {"status": "no_backup", ...}  if no backup has been taken yet
    """
    meta_path = BACKUP_DIR / ".last_backup"

    if not meta_path.exists():
        return jsonify({
            'status': 'no_backup',
            'message': 'No backup has been recorded yet.',
            'backup_dir': str(BACKUP_DIR),
            'backup_dir_exists': BACKUP_DIR.exists(),
        })

    try:
        meta = json.loads(meta_path.read_text())
    except (json.JSONDecodeError, OSError):
        return jsonify({
            'status': 'error',
            'message': 'Backup metadata file is corrupted or unreadable.',
            'backup_dir': str(BACKUP_DIR),
        }), 500

    # Verify the referenced backup file still exists
    backup_file = BACKUP_DIR / meta.get('file', '')
    meta['file_exists'] = backup_file.exists()

    return jsonify({
        'status': 'ok',
        'last_backup': meta,
        'backup_dir': str(BACKUP_DIR),
    })
