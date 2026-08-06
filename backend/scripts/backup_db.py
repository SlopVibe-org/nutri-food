#!/usr/bin/env python3
"""Automated SQLite backup for NutriFood.

Uses VACUUM INTO for atomic snapshots, retains 7 daily + 4 weekly backups,
and optionally uploads to Nextcloud via WebDAV.

Usage:
    python3 scripts/backup_db.py            # backup + retention
    python3 scripts/backup_db.py --dry-run  # show what would happen

Env vars:
    DB_PATH           Source SQLite DB (default: /data/nutrifood.db)
    BACKUP_DIR        Backup destination  (default: /data/backups)
    NC_WEBDAV_URL     Optional Nextcloud WebDAV base URL
    NC_USER           Nextcloud username
    NC_PASS           Nextcloud password / app password
"""
from __future__ import annotations

import os
import sys
import glob
import sqlite3
import urllib.request
import urllib.error
from datetime import datetime, timezone, timedelta
from pathlib import Path
from base64 import b64encode

# ─── Configuration ───
DB_PATH = Path(os.environ.get("DB_PATH", "/data/nutrifood.db"))
BACKUP_DIR = Path(os.environ.get("BACKUP_DIR", "/data/backups"))
DAILY_RETENTION = 7
WEEKLY_RETENTION = 4
# VACUUM INTO requires SQLite 3.27+ (released 2019-02)
MIN_SQLITE_VERSION = (3, 27, 0)


def _fail(msg: str, code: int = 1) -> None:
    """Print error to stderr and exit — equivalent to `set -e` for scripts."""
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(code)


def _check_prerequisites() -> None:
    """Validate environment before attempting any work."""
    if sqlite3.sqlite_version_info < MIN_SQLITE_VERSION:
        _fail(
            f"SQLite {sqlite3.sqlite_version} is too old; "
            f"need >={'.'.join(map(str, MIN_SQLITE_VERSION))} for VACUUM INTO"
        )
    if not DB_PATH.exists():
        _fail(f"Database not found: {DB_PATH}")
    if not DB_PATH.is_file():
        _fail(f"Path is not a regular file: {DB_PATH}")


def _timestamp() -> str:
    """UTC date string for backup filename."""
    return datetime.now(timezone.utc).strftime("%Y%m%d")


def create_backup(dry_run: bool = False) -> Path | None:
    """Create an atomic snapshot of the DB via VACUUM INTO.

    Returns the path to the backup file, or None on dry run.
    """
    backup_name = f"nutrifood-{_timestamp()}.db"
    backup_path = BACKUP_DIR / backup_name

    if dry_run:
        print(f"[dry-run] Would VACUUM INTO {backup_path}")
        return None

    BACKUP_DIR.mkdir(parents=True, exist_ok=True)

    # Connect to source DB and snapshot atomically.
    # VACUUM INTO creates a consistent point-in-time copy without
    # locking the DB for writers (uses online backup under the hood).
    conn = sqlite3.connect(str(DB_PATH))
    try:
        conn.execute(f"VACUUM INTO '{backup_path}'")
    except sqlite3.Error as exc:
        _fail(f"VACUUM INTO failed: {exc}")
    finally:
        conn.close()

    size_kb = backup_path.stat().st_size / 1024
    print(f"Backup created: {backup_path} ({size_kb:.1f} KB)")

    # Record metadata for the health endpoint
    meta_path = BACKUP_DIR / ".last_backup"
    meta_content = (
        f'{{"timestamp": "{datetime.now(timezone.utc).isoformat()}", '
        f'"file": "{backup_name}", '
        f'"size_bytes": {backup_path.stat().st_size}}}'
    )
    meta_path.write_text(meta_content)

    return backup_path


def _parse_backup_date(filename: str) -> datetime | None:
    """Extract the date from a backup filename like nutrifood-20260806.db."""
    try:
        date_str = filename.removeprefix("nutrifood-").removesuffix(".db")
        return datetime.strptime(date_str, "%Y%m%d").replace(tzinfo=timezone.utc)
    except (ValueError, AttributeError):
        return None


def apply_retention(dry_run: bool = False) -> list[Path]:
    """Delete backups older than the retention window.

    Strategy: keep 7 most-recent daily backups + 4 most-recent weekly backups.
    """
    pattern = str(BACKUP_DIR / "nutrifood-*.db")
    all_backups = sorted(glob.glob(pattern), reverse=True)  # newest first

    now = datetime.now(timezone.utc)

    # Build list of (path, date) for valid backups
    dated: list[tuple[Path, datetime]] = []
    for path_str in all_backups:
        name = Path(path_str).name
        dt = _parse_backup_date(name)
        if dt:
            dated.append((Path(path_str), dt))

    if not dated:
        return []

    # --- Daily retention: keep newest DAILY_RETENTION backups ---
    daily_keep = {p for p, _ in dated[:DAILY_RETENTION]}

    # --- Weekly retention: for backups older than DAILY_RETENTION days,
    #     keep one per ISO week (the newest in each week), up to 4 weeks ---
    weekly_slots: dict[tuple[int, int], Path] = {}  # (year, week) -> path
    cutoff = now - timedelta(days=DAILY_RETENTION)
    weekly_cutoff = now - timedelta(days=DAILY_RETENTION + WEEKLY_RETENTION * 7)

    for path, dt in dated:
        if dt >= cutoff:
            continue  # within daily window, always kept
        if dt < weekly_cutoff:
            break  # older than weekly window
        iso = dt.isocalendar()
        key = (iso[0], iso[1])
        if key not in weekly_slots:
            weekly_slots[key] = path

    weekly_keep = set(weekly_slots.values())
    keep_set = daily_keep | weekly_keep

    deleted: list[Path] = []
    for path, _ in dated:
        if path not in keep_set:
            if dry_run:
                print(f"[dry-run] Would delete {path.name}")
            else:
                path.unlink()
                print(f"Deleted old backup: {path.name}")
            deleted.append(path)

    return deleted


def upload_to_nextcloud(backup_path: Path) -> bool:
    """Upload backup to Nextcloud via WebDAV. Returns True on success."""
    webdav_url = os.environ.get("NC_WEBDAV_URL")
    user = os.environ.get("NC_USER")
    password = os.environ.get("NC_PASS")

    if not all([webdav_url, user, password]):
        return False  # Not configured — skip silently

    # Ensure trailing slash on base URL
    if not webdav_url.endswith("/"):
        webdav_url += "/"

    upload_url = f"{webdav_url}{backup_path.name}"

    data = backup_path.read_bytes()
    req = urllib.request.Request(
        upload_url,
        data=data,
        method="PUT",
        headers={"Content-Type": "application/x-sqlite3"},
    )

    try:
        credentials = b64encode(f"{user}:{password}".encode()).decode()
        req.add_header("Authorization", f"Basic {credentials}")
        with urllib.request.urlopen(req, timeout=120) as resp:
            if 200 <= resp.status < 300:
                print(f"Uploaded to Nextcloud: {upload_url}")
                return True
            print(f"Nextcloud upload failed: HTTP {resp.status}", file=sys.stderr)
            return False
    except urllib.error.HTTPError as exc:
        print(f"Nextcloud upload HTTP error: {exc.code} {exc.reason}", file=sys.stderr)
        return False
    except OSError as exc:
        print(f"Nextcloud upload network error: {exc}", file=sys.stderr)
        return False


def main() -> int:
    """Entry point — parse args, run backup pipeline."""
    dry_run = "--dry-run" in sys.argv

    _check_prerequisites()

    print(f"[{datetime.now(timezone.utc).isoformat()}] Starting NutriFood backup...")
    print(f"  Source: {DB_PATH}")

    backup_path = create_backup(dry_run=dry_run)

    if dry_run:
        apply_retention(dry_run=True)
        print("[dry-run] Done.")
        return 0

    if backup_path is None:
        _fail("Backup file was not created unexpectedly.")

    apply_retention()

    # Optional Nextcloud upload
    if os.environ.get("NC_WEBDAV_URL"):
        upload_to_nextcloud(backup_path)

    print("Backup complete.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
