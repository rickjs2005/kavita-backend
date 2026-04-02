#!/bin/bash
# =============================================================================
# scripts/deploy-cpf-encryption.sh
#
# Script de deployment para ativar criptografia de CPF em produção.
# Executa backup, validação, migration e verificação.
#
# Uso:
#   chmod +x scripts/deploy-cpf-encryption.sh
#   ./scripts/deploy-cpf-encryption.sh
#
# Pré-requisitos:
#   - CPF_ENCRYPTION_KEY definida no .env (ou exportada no shell)
#   - mysqldump disponível no PATH
#   - Variáveis de banco configuradas (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME)
# =============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()   { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

# ── Carregar .env se existir ──────────────────────────────────────────────
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

# ── Validações ────────────────────────────────────────────────────────────

echo ""
echo "============================================"
echo "  Deploy: Criptografia de CPF (LGPD)"
echo "============================================"
echo ""

[ -z "${CPF_ENCRYPTION_KEY:-}" ] && error "CPF_ENCRYPTION_KEY não definida. Gere com:\n  node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\""
[ -z "${DB_HOST:-}" ]            && error "DB_HOST não definida."
[ -z "${DB_USER:-}" ]            && error "DB_USER não definida."
[ -z "${DB_NAME:-}" ]            && error "DB_NAME não definida."

log "CPF_ENCRYPTION_KEY presente (${#CPF_ENCRYPTION_KEY} chars)"
log "Banco: ${DB_USER}@${DB_HOST}/${DB_NAME}"

# ── Verificar estado atual ────────────────────────────────────────────────

echo ""
warn "Verificando estado atual dos CPFs..."

CPF_SAMPLE=$(mysql -h "$DB_HOST" -u "$DB_USER" ${DB_PASSWORD:+-p"$DB_PASSWORD"} "$DB_NAME" \
  -N -e "SELECT cpf FROM usuarios WHERE cpf IS NOT NULL AND cpf != '' LIMIT 1" 2>/dev/null || echo "")

if [ -z "$CPF_SAMPLE" ]; then
  warn "Nenhum CPF encontrado no banco. Migration vai apenas criar a coluna cpf_hash."
elif echo "$CPF_SAMPLE" | grep -q ":"; then
  log "CPFs já parecem criptografados (contêm ':'). Verificando se migration já rodou..."
  HAS_HASH=$(mysql -h "$DB_HOST" -u "$DB_USER" ${DB_PASSWORD:+-p"$DB_PASSWORD"} "$DB_NAME" \
    -N -e "SELECT COUNT(*) FROM information_schema.columns WHERE table_name='usuarios' AND column_name='cpf_hash'" 2>/dev/null || echo "0")
  if [ "$HAS_HASH" = "1" ]; then
    log "Coluna cpf_hash já existe. Migration provavelmente já foi executada."
    warn "Abortando para evitar re-criptografia. Verifique manualmente se necessário."
    exit 0
  fi
else
  warn "CPFs estão em PLAINTEXT. Procedendo com migration."
fi

# ── Backup ────────────────────────────────────────────────────────────────

echo ""
BACKUP_FILE="backup_usuarios_$(date +%Y%m%d_%H%M%S).sql"
warn "Criando backup da tabela usuarios..."

mysqldump -h "$DB_HOST" -u "$DB_USER" ${DB_PASSWORD:+-p"$DB_PASSWORD"} \
  "$DB_NAME" usuarios > "$BACKUP_FILE" 2>/dev/null \
  || error "Falha no backup. Abortando."

log "Backup salvo: $BACKUP_FILE ($(wc -c < "$BACKUP_FILE") bytes)"

# ── Contagem pré-migration ────────────────────────────────────────────────

TOTAL_CPFS=$(mysql -h "$DB_HOST" -u "$DB_USER" ${DB_PASSWORD:+-p"$DB_PASSWORD"} "$DB_NAME" \
  -N -e "SELECT COUNT(*) FROM usuarios WHERE cpf IS NOT NULL AND cpf != ''" 2>/dev/null || echo "?")

log "CPFs a criptografar: $TOTAL_CPFS"

# ── Executar migration ────────────────────────────────────────────────────

echo ""
warn "Executando migration..."

npm run db:migrate 2>&1 | tail -5

if [ $? -ne 0 ]; then
  error "Migration falhou. Banco NÃO foi alterado (migration é transacional).\n  Backup disponível em: $BACKUP_FILE"
fi

log "Migration executada com sucesso."

# ── Verificação pós-migration ─────────────────────────────────────────────

echo ""
warn "Verificando resultado..."

# Checar se cpf_hash existe
HAS_HASH=$(mysql -h "$DB_HOST" -u "$DB_USER" ${DB_PASSWORD:+-p"$DB_PASSWORD"} "$DB_NAME" \
  -N -e "SELECT COUNT(*) FROM information_schema.columns WHERE table_name='usuarios' AND column_name='cpf_hash'" 2>/dev/null || echo "0")

[ "$HAS_HASH" != "1" ] && error "Coluna cpf_hash NÃO encontrada após migration."
log "Coluna cpf_hash existe."

# Checar se CPFs foram criptografados
ENCRYPTED_COUNT=$(mysql -h "$DB_HOST" -u "$DB_USER" ${DB_PASSWORD:+-p"$DB_PASSWORD"} "$DB_NAME" \
  -N -e "SELECT COUNT(*) FROM usuarios WHERE cpf IS NOT NULL AND cpf LIKE '%:%'" 2>/dev/null || echo "0")

HASH_COUNT=$(mysql -h "$DB_HOST" -u "$DB_USER" ${DB_PASSWORD:+-p"$DB_PASSWORD"} "$DB_NAME" \
  -N -e "SELECT COUNT(*) FROM usuarios WHERE cpf_hash IS NOT NULL AND cpf_hash != ''" 2>/dev/null || echo "0")

log "CPFs criptografados: $ENCRYPTED_COUNT / $TOTAL_CPFS"
log "cpf_hash populados: $HASH_COUNT / $TOTAL_CPFS"

# Amostra
echo ""
warn "Amostra (primeiros 3 registros):"
mysql -h "$DB_HOST" -u "$DB_USER" ${DB_PASSWORD:+-p"$DB_PASSWORD"} "$DB_NAME" \
  -e "SELECT id, LEFT(cpf, 40) AS cpf_preview, LEFT(cpf_hash, 20) AS hash_preview FROM usuarios WHERE cpf IS NOT NULL LIMIT 3" 2>/dev/null

# ── Teste round-trip ──────────────────────────────────────────────────────

echo ""
warn "Testando round-trip de decrypt no Node.js..."

node -e "
  require('dotenv').config();
  const { decryptCPF } = require('./utils/cpfCrypto');
  const pool = require('./config/pool');
  (async () => {
    const [rows] = await pool.query('SELECT id, cpf FROM usuarios WHERE cpf IS NOT NULL AND cpf != \"\" LIMIT 1');
    if (!rows.length) { console.log('Sem CPFs para testar.'); process.exit(0); }
    const row = rows[0];
    const decrypted = decryptCPF(row.cpf);
    if (decrypted && /^\d{11}$/.test(decrypted)) {
      console.log('✅ Round-trip OK: decrypt retorna 11 dígitos para user #' + row.id);
    } else {
      console.error('❌ Round-trip FALHOU para user #' + row.id + ': got', decrypted);
      process.exit(1);
    }
    await pool.end();
  })();
" || error "Round-trip falhou. Verificar CPF_ENCRYPTION_KEY e dados."

# ── Resultado final ───────────────────────────────────────────────────────

echo ""
echo "============================================"
log "CPF encryption ativada com sucesso!"
echo "============================================"
echo ""
echo "  Backup: $BACKUP_FILE"
echo "  CPFs criptografados: $ENCRYPTED_COUNT"
echo "  Hashes populados: $HASH_COUNT"
echo ""
echo "  Para reverter (emergência):"
echo "    npm run db:migrate:undo"
echo "    # ou restaurar backup:"
echo "    mysql -h $DB_HOST -u $DB_USER -p $DB_NAME < $BACKUP_FILE"
echo ""
warn "IMPORTANTE: Guarde CPF_ENCRYPTION_KEY em local seguro."
warn "Perder a chave = perder acesso aos CPFs criptografados."
echo ""
