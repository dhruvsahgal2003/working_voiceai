#!/usr/bin/env bash
# Nightly backup: Postgres dump (gzipped, rotated) + MinIO recordings mirror.
# Local-disk backup only — protects against accidental deletes, bad migrations,
# and DB corruption. Does NOT protect against total loss of this box/volume;
# that needs an offsite destination (see ONBOARDING.md / ops notes).
set -euo pipefail

BACKUP_ROOT="/home/ubuntu/backups"
ENV_FILE="/home/ubuntu/realestate-voice-agent/backend/.env"
RETENTION_DAYS=14
TIMESTAMP=$(date -u +%Y%m%d_%H%M%S)

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

DATABASE_URL=$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2-)
if [ -z "$DATABASE_URL" ]; then
  log "ERROR: DATABASE_URL not found in $ENV_FILE"
  exit 1
fi

# --- Postgres ---
DUMP_FILE="$BACKUP_ROOT/postgres/velryx_${TIMESTAMP}.sql.gz"
log "Starting Postgres dump -> $DUMP_FILE"
pg_dump "$DATABASE_URL" | gzip > "$DUMP_FILE.tmp"
mv "$DUMP_FILE.tmp" "$DUMP_FILE"
log "Postgres dump complete: $(du -h "$DUMP_FILE" | cut -f1)"

find "$BACKUP_ROOT/postgres" -name "velryx_*.sql.gz" -mtime +"$RETENTION_DAYS" -print -delete | while read -r f; do
  log "Rotated out old backup: $f"
done

# --- MinIO recordings (append-only mirror — never deletes from the backup copy,
# even if a recording is later deleted at the source) ---
log "Mirroring MinIO 'storage' bucket -> $BACKUP_ROOT/minio/storage"
mc mirror velryx/storage "$BACKUP_ROOT/minio/storage"
log "MinIO mirror complete"

log "Backup run finished OK"
