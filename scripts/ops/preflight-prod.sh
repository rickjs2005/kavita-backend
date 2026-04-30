#!/usr/bin/env bash
#
# scripts/ops/preflight-prod.sh — checklist obrigatório antes do deploy
# em produção.
#
# Roda 3 grupos de validação:
#   1) Envs novas pós-Fase 1 + F1 estão setadas e bem-formadas
#   2) Auditoria SQL: 0 contratos com signer_provider='stub' em status sent/signed
#   3) Auditoria SQL: lista admins ativos sem 2FA (warn, não bloqueia, mas
#      precisa onboarding antes de eles tentarem rotas sensíveis)
#
# Exit codes:
#   0  todas as checks passaram
#   1  env faltando ou inválida (BLOCKER)
#   2  contratos stub encontrados em sent/signed (BLOCKER)
#   3  erro de conexão com DB (BLOCKER — provavelmente env errada)
#
# Uso (no servidor de produção, com .env.production ativo):
#   bash scripts/ops/preflight-prod.sh
#
# Saída: relatório legível para colar no go-live-tracker.md

set -uo pipefail

cd "$(dirname "$0")/../.."
ROOT="$(pwd)"

echo "============================================================"
echo " Preflight de produção — Kavita"
echo " $(date -u +'%Y-%m-%dT%H:%M:%SZ')"
echo "============================================================"
echo

FAIL=0

# ---------------------------------------------------------------------------
# 1) Envs obrigatórias
# ---------------------------------------------------------------------------
echo "## 1. Envs obrigatórias"
echo

REQUIRED=(
  JWT_SECRET
  DB_HOST DB_USER DB_PASSWORD DB_NAME
  APP_URL BACKEND_URL
  MP_ACCESS_TOKEN MP_WEBHOOK_SECRET
  MP_WEBHOOK_URL
  CPF_ENCRYPTION_KEY
  CONTRATO_SIGNER_PROVIDER
  CLICKSIGN_API_TOKEN CLICKSIGN_HMAC_SECRET
  MFA_ENCRYPTION_KEY
  WEBHOOK_RETRY_JOB_ENABLED
)

for k in "${REQUIRED[@]}"; do
  v="${!k:-}"
  if [ -z "$v" ]; then
    echo "  [FAIL] $k não definida"
    FAIL=1
  else
    # mascara: mostra só os 3 primeiros chars + ...
    masked="${v:0:3}…(len=${#v})"
    echo "  [OK]   $k = $masked"
  fi
done

# Validações de formato extras
echo
echo "### Validações de formato"
if [ -n "${MP_WEBHOOK_URL:-}" ]; then
  if [[ ! "$MP_WEBHOOK_URL" =~ ^https:// ]]; then
    echo "  [FAIL] MP_WEBHOOK_URL não começa com 'https://'"
    FAIL=1
  else
    echo "  [OK]   MP_WEBHOOK_URL é HTTPS"
  fi
fi

if [ "${CONTRATO_SIGNER_PROVIDER:-}" != "clicksign" ]; then
  echo "  [FAIL] CONTRATO_SIGNER_PROVIDER deve ser 'clicksign' (atual: '${CONTRATO_SIGNER_PROVIDER:-vazio}')"
  FAIL=1
else
  echo "  [OK]   CONTRATO_SIGNER_PROVIDER = clicksign"
fi

if [ "${WEBHOOK_RETRY_JOB_ENABLED:-}" != "true" ]; then
  echo "  [FAIL] WEBHOOK_RETRY_JOB_ENABLED deve ser 'true' em produção"
  FAIL=1
else
  echo "  [OK]   WEBHOOK_RETRY_JOB_ENABLED = true"
fi

if [ "$FAIL" -ne 0 ]; then
  echo
  echo "RESULTADO PARCIAL: envs falharam — corrigir antes de continuar"
  exit 1
fi

# ---------------------------------------------------------------------------
# 2) Auditoria SQL — contratos stub
# ---------------------------------------------------------------------------
echo
echo "## 2. Auditoria SQL — contratos com signer_provider='stub'"
echo

# Usa node + dotenv pra reusar mesma config do app
STUB_OUT=$(node -e "
require('dotenv').config();
const m = require('mysql2/promise');
(async () => {
  const c = await m.createConnection({
    host: process.env.DB_HOST, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT || 3306),
  });
  const [count] = await c.query(\"SELECT COUNT(*) AS n FROM contratos WHERE signer_provider='stub' AND status IN ('sent','signed')\");
  console.log('STUB_COUNT=' + count[0].n);
  if (count[0].n > 0) {
    const [rows] = await c.query(\"SELECT id, corretora_id, lead_id, status, created_at, signed_at FROM contratos WHERE signer_provider='stub' AND status IN ('sent','signed') ORDER BY created_at DESC LIMIT 50\");
    console.log('STUB_SAMPLE=' + JSON.stringify(rows));
  }
  await c.end();
})().catch(e => { console.error('DB_ERROR=' + e.message); process.exit(2); });
" 2>&1) || {
  echo "$STUB_OUT"
  echo
  echo "RESULTADO PARCIAL: erro conectando ao DB. Confira DB_HOST/USER/PASSWORD."
  exit 3
}
echo "$STUB_OUT"

STUB_COUNT=$(echo "$STUB_OUT" | grep -oE 'STUB_COUNT=[0-9]+' | head -1 | cut -d= -f2)
if [ "${STUB_COUNT:-0}" -gt 0 ]; then
  echo
  echo "BLOCKER: $STUB_COUNT contratos em estado sent/signed com signer_provider='stub'."
  echo "Remediar antes do go-live (ver kavita-os/docs/go-live-tracker.md, seção"
  echo "'Trava operacional pré-merge'). Sem isso, ao subir o backend o boot recusa."
  exit 2
fi

echo "  [OK] 0 contratos stub em sent/signed."

# ---------------------------------------------------------------------------
# 3) Auditoria SQL — admins ativos sem 2FA
# ---------------------------------------------------------------------------
echo
echo "## 3. Auditoria — admins ativos sem 2FA"
echo

NOMFA_OUT=$(node -e "
require('dotenv').config();
const m = require('mysql2/promise');
(async () => {
  const c = await m.createConnection({
    host: process.env.DB_HOST, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT || 3306),
  });
  const [rows] = await c.query(\"SELECT id, email, role FROM admins WHERE ativo=1 AND (mfa_active=0 OR mfa_active IS NULL) ORDER BY id\");
  console.log('NOMFA_COUNT=' + rows.length);
  if (rows.length > 0) {
    console.log('NOMFA_LIST=' + JSON.stringify(rows));
  }
  await c.end();
})().catch(e => { console.error('DB_ERROR=' + e.message); process.exit(3); });
" 2>&1)
echo "$NOMFA_OUT"

NOMFA_COUNT=$(echo "$NOMFA_OUT" | grep -oE 'NOMFA_COUNT=[0-9]+' | head -1 | cut -d= -f2)
if [ "${NOMFA_COUNT:-0}" -gt 0 ]; then
  echo
  echo "WARN: $NOMFA_COUNT admin(s) ativo(s) sem 2FA. Não bloqueia o deploy"
  echo "(porque /admin/totp/* fica fora do middleware), mas eles vão tomar 403 nas"
  echo "rotas /admin/{config,pedidos,mercado-do-cafe,users,admins,roles,permissions,monetization,contratos}"
  echo "até fazer setup. Agendar enrollment antes do go-live."
fi

echo
echo "============================================================"
echo " Preflight CONCLUÍDO sem blockers"
echo " Próximo passo: backup do DB + deploy"
echo "============================================================"
exit 0
