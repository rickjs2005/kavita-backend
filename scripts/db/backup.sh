#!/usr/bin/env bash
# scripts/db/backup.sh
#
# Backup do banco MySQL do Kavita.
#
# Uso:
#   ./scripts/db/backup.sh                 # usa vars do ambiente
#   KEEP_DAYS=30 ./scripts/db/backup.sh    # retenção custom
#
# Vars lidas (mesmas do app): DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME.
# Saída: BACKUP_DIR/YYYY-MM-DD/kavita-YYYYMMDD-HHMMSS.sql.gz
# Retenção padrão: 14 dias (apaga arquivos mais antigos).
#
# Para cron (exemplo a cada 6h):
#   0 */6 * * * /srv/kavita/kavita-backend/scripts/db/backup.sh >> /var/log/kavita-backup.log 2>&1

set -euo pipefail

# Carrega .env se existir (não sobrescreve env já exportado)
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
KEEP_DAYS="${KEEP_DAYS:-14}"

DATE_DIR="$(date +%Y-%m-%d)"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="${BACKUP_DIR}/${DATE_DIR}"
OUT_FILE="${OUT_DIR}/kavita-${STAMP}.sql.gz"

mkdir -p "${OUT_DIR}"

echo "[$(date -Iseconds)] backup start -> ${OUT_FILE}"

# --single-transaction: consistente sem lockar tabelas InnoDB
# --routines/--triggers/--events: não perde lógica server-side
# --set-gtid-purged=OFF: compatível com restore em servidor diferente
mysqldump \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --user="${DB_USER}" \
  --password="${DB_PASSWORD}" \
  --single-transaction \
  --quick \
  --routines \
  --triggers \
  --events \
  --default-character-set=utf8mb4 \
  --set-gtid-purged=OFF \
  "${DB_NAME}" \
  | gzip -9 > "${OUT_FILE}"

SIZE="$(du -h "${OUT_FILE}" | cut -f1)"
echo "[$(date -Iseconds)] backup ok: ${OUT_FILE} (${SIZE})"

# Retenção: apaga diretórios de data mais antigos que KEEP_DAYS
find "${BACKUP_DIR}" -mindepth 1 -maxdepth 1 -type d -mtime +"${KEEP_DAYS}" -print -exec rm -rf {} +

echo "[$(date -Iseconds)] retention cleanup done (keep=${KEEP_DAYS}d)"
