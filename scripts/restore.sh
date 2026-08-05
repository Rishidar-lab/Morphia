#!/usr/bin/env bash
# MORPHIA PostgreSQL restore script
# Usage: ./scripts/restore.sh backups/morphia_2026-08-05.sql.gz
set -euo pipefail

BACKUP_FILE="${1:-}"

if [ -z "${BACKUP_FILE}" ]; then
  echo "Usage: $0 <backup-file.sql.gz>"
  echo "Available backups:"
  ls -la backups/*.sql.gz 2>/dev/null || echo "  (none found)"
  exit 1
fi

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "ERROR: File not found: ${BACKUP_FILE}"
  exit 1
fi

if [ -z "${DATABASE_URL_SYNC:-}" ]; then
  if [ -f .env ]; then
    export $(grep -v '^#' .env | grep DATABASE_URL_SYNC | xargs)
  fi
fi

if [ -z "${DATABASE_URL_SYNC:-}" ]; then
  echo "ERROR: DATABASE_URL_SYNC is not set."
  exit 1
fi

echo "WARNING: This will overwrite the current database."
read -p "Continue? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 0
fi

echo "Restoring from: ${BACKUP_FILE}"
gunzip -c "${BACKUP_FILE}" | psql "${DATABASE_URL_SYNC}"
echo "Restore complete."
