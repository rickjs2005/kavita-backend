#!/usr/bin/env bash
#
# scripts/ops/smoke-prod.sh — smoke pós-deploy.
#
# Bate em endpoints públicos do backend para confirmar que o deploy
# está respondendo. NÃO faz pedido real, NÃO toca em pagamento — só
# valida que a infra subiu.
#
# Uso:
#   BASE=https://api.kavita.com.br bash scripts/ops/smoke-prod.sh
#
# Ou (se rodando contra staging):
#   BASE=https://api-staging.kavita.com.br bash scripts/ops/smoke-prod.sh

set -uo pipefail

BASE="${BASE:-https://api.kavita.com.br}"
echo "Smoke contra: $BASE"
echo

FAIL=0

check() {
  local name="$1"
  local expected_status="$2"
  local url="$3"
  local extra="${4:-}"

  local code
  code=$(curl -s -o /tmp/smoke-body.txt -w "%{http_code}" --max-time 10 $extra "$url" 2>/dev/null)
  if [ "$code" = "$expected_status" ]; then
    echo "  [OK]   $name → $code  $url"
  else
    echo "  [FAIL] $name → $code (esperado $expected_status)  $url"
    head -c 200 /tmp/smoke-body.txt 2>/dev/null
    echo
    FAIL=1
  fi
}

echo "## 1. Health"
check "health" "200" "$BASE/health"

echo
echo "## 2. CSRF endpoint"
check "csrf-token" "200" "$BASE/api/csrf-token"

echo
echo "## 3. Endpoints públicos (devem retornar 200)"
check "public/produtos" "200" "$BASE/api/public/produtos?limit=1"
check "public/categorias" "200" "$BASE/api/public/categorias"
check "config" "200" "$BASE/api/config"

echo
echo "## 4. Endpoints autenticados (devem retornar 401 sem cookie)"
check "admin/me" "401" "$BASE/api/admin/me"
check "users/me" "401" "$BASE/api/users/me"

echo
echo "## 5. Webhook MP sem assinatura (deve retornar 401)"
check "payment/webhook" "401" "$BASE/api/payment/webhook" "-X POST -H 'Content-Type: application/json' -d {}"

echo
if [ "$FAIL" -ne 0 ]; then
  echo "SMOKE FALHOU — investigar antes de liberar tráfego."
  exit 1
fi

echo "Smoke OK. Servidor responde, contratos básicos honrados."
echo "Próximo passo: pedido de teste R$ 1 PIX manual via UI."
