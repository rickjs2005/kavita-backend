#!/usr/bin/env bash
# scripts/db/restore.sh
#
# Restaura um dump produzido por backup.sh.
#
# Uso:
#   ./scripts/db/restore.sh /var/backups/kavita/2026-04-15/kavita-20260415-060000.sql.gz
#
# Por segurança, exige a variável CONFIRM=yes para evitar restore acidental.
#   CONFIRM=yes ./scripts/db/restore.sh <arquivo>
#
# Sempre faz um backup rápido do estado atual ANTES de restaurar
# (em BACKUP_DIR/pre-restore/).

set -euo pipefail

FILE="${1:-}"
if [[ -z "${FILE}" || ! -f "${FILE}" ]]; then
  echo "Uso: $0 <arquivo.sql.gz>"
  exit 2
fi

if [[ "${CONFIRM:-}" != "yes" ]]; then
  echo "Restore vai SOBRESCREVER o banco '${DB_NAME:-?}' a partir de '${FILE}'."
  echo "Para confirmar, re-execute com CONFIRM=yes."
  exit 1
fi

if [[ -f "$(dirname "$0")/../../.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  . "$(dirname "$0")/../../.env"
  set +a
fi

: "${DB_HOST:?DB_HOST is required}"
: "${DB_USER:?DB_USER is required}"
: "${DB_PASSWORD:?DB_PASSWORD is required}"
: "${DB_NAME:?DB_NAME is required}"

DB_PORT="${DB_PORT:-3306}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/kavita}"
PRE_DIR="${BACKUP_DIR}/pre-restore"
STAMP="$(date +%Y%m%d-%H%M%S)"
PRE_FILE="${PRE_DIR}/pre-restore-${STAMP}.sql.gz"

mkdir -p "${PRE_DIR}"

echo "[$(date -Iseconds)] snapshot atual -> ${PRE_FILE}"
mysqldump \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --user="${DB_USER}" \
  --password="${DB_PASSWORD}" \
  --single-transaction --quick --routines --triggers --events \
  --default-character-set=utf8mb4 --set-gtid-purged=OFF \
  "${DB_NAME}" | gzip -9 > "${PRE_FILE}"

echo "[$(date -Iseconds)] restaurando ${FILE} -> ${DB_NAME}"
gunzip -c "${FILE}" | mysql \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --user="${DB_USER}" \
  --password="${DB_PASSWORD}" \
  --default-character-set=utf8mb4 \
  "${DB_NAME}"

echo "[$(date -Iseconds)] restore concluído. Snapshot pré-restore: ${PRE_FILE}"
