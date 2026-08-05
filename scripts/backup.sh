#!/usr/bin/env bash
# MORPHIA PostgreSQL backup script
# Usage: ./scripts/backup.sh
# Requires: DATABASE_URL_SYNC env var or .env file
set -euo pipefail

BACKUP_DIR="./backups"
TIMESTAMP=$(date +"%Y-%m-%d_%H%M%S")
FILENAME="morphia_${TIMESTAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"

# Extract connection details from DATABASE_URL_SYNC
if [ -z "${DATABASE_URL_SYNC:-}" ]; then
  if [ -f .env ]; then
    export $(grep -v '^#' .env | grep DATABASE_URL_SYNC | xargs)
  fi
fi

if [ -z "${DATABASE_URL_SYNC:-}" ]; then
  echo "ERROR: DATABASE_URL_SYNC is not set."
  exit 1
fi

echo "Creating backup: ${BACKUP_DIR}/${FILENAME}"
pg_dump "${DATABASE_URL_SYNC}" | gzip > "${BACKUP_DIR}/${FILENAME}"

echo "Backup complete: ${BACKUP_DIR}/${FILENAME}"
echo "Size: $(du -h "${BACKUP_DIR}/${FILENAME}" | cut -f1)"
