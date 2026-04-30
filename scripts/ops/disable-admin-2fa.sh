#!/usr/bin/env bash
#
# scripts/ops/disable-admin-2fa.sh — F1.5 procedimento de emergência.
#
# Desliga o 2FA de UM admin que perdeu o celular E os backup codes.
# Quem roda: outro admin master, com SSH/console no servidor de produção.
#
# Política:
#   - Confirmação dupla por digitar o e-mail duas vezes.
#   - Motivo de uso obrigatório (livre, vai pro audit).
#   - Idempotente: se admin já está sem 2FA, só registra log informativo.
#   - Logs:
#       * stdout estruturado (operador vê o que aconteceu)
#       * INSERT em admin_audit_logs com action='totp_admin_reset_emergency'
#       * Sentry warning (best-effort) com tag domain=security.totp_emergency_reset
#   - O comando NÃO precisa de senha do admin alvo nem aceita reset por
#     senha — assume que quem rodou já é admin master autenticado fora
#     da banda (Bastion/console).
#
# Uso:
#   bash scripts/ops/disable-admin-2fa.sh
#
# Variáveis de ambiente lidas (.env via dotenv): DB_HOST/USER/PASS/NAME/PORT,
# SENTRY_DSN (opcional).

set -euo pipefail

cd "$(dirname "$0")/../.."
ROOT="$(pwd)"

if [ ! -f "$ROOT/package.json" ]; then
  echo "ERRO: este script deve rodar a partir da raiz de kavita-backend." >&2
  exit 1
fi

echo "============================================================"
echo " RESET DE 2FA DE ADMIN — PROCEDIMENTO DE EMERGÊNCIA"
echo " Refs: docs/troubleshooting-fase1.md (F1 — Admin sem celular)"
echo "============================================================"
echo
echo " ATENÇÃO: esta ação:"
echo "   - APAGA o segredo TOTP do admin alvo"
echo "   - APAGA todos os backup codes do admin alvo"
echo "   - INCREMENTA o tokenVersion (encerra todas as sessões dele)"
echo "   - REGISTRA em admin_audit_logs"
echo "   - DISPARA alerta no Sentry (se configurado)"
echo
echo " O admin alvo precisará fazer setup de 2FA do zero no próximo login."
echo

# ---------------------------------------------------------------------------
# Confirmação dupla por e-mail
# ---------------------------------------------------------------------------
read -r -p "E-mail do admin alvo: " EMAIL_1
EMAIL_1="$(echo "$EMAIL_1" | tr -d '[:space:]')"
if [ -z "$EMAIL_1" ]; then
  echo "ERRO: e-mail vazio. Abortado." >&2
  exit 2
fi

read -r -p "Confirme o e-mail (digitar de novo): " EMAIL_2
EMAIL_2="$(echo "$EMAIL_2" | tr -d '[:space:]')"
if [ "$EMAIL_1" != "$EMAIL_2" ]; then
  echo "ERRO: os dois e-mails não batem. Abortado." >&2
  exit 3
fi
EMAIL="$EMAIL_1"

# ---------------------------------------------------------------------------
# Motivo obrigatório
# ---------------------------------------------------------------------------
echo
echo "Informe o motivo (mínimo 10 caracteres). Exemplos:"
echo "  - admin perdeu celular e não tem backup code"
echo "  - admin saiu da empresa, recuperar acesso para reset de senha"
echo
read -r -p "Motivo: " MOTIVO
MOTIVO="$(echo "$MOTIVO" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
if [ "${#MOTIVO}" -lt 10 ]; then
  echo "ERRO: motivo precisa ter ao menos 10 caracteres. Abortado." >&2
  exit 4
fi

# ---------------------------------------------------------------------------
# Quem está executando (operador) — vai pro audit_log
# ---------------------------------------------------------------------------
read -r -p "E-mail do operador (você): " OPERATOR_EMAIL
OPERATOR_EMAIL="$(echo "$OPERATOR_EMAIL" | tr -d '[:space:]')"
if [ -z "$OPERATOR_EMAIL" ]; then
  echo "ERRO: operador vazio. Abortado." >&2
  exit 5
fi

# ---------------------------------------------------------------------------
# Confirmação final
# ---------------------------------------------------------------------------
echo
echo "============================================================"
echo "  E-mail alvo:        $EMAIL"
echo "  Motivo:             $MOTIVO"
echo "  Operador:           $OPERATOR_EMAIL"
echo "============================================================"
read -r -p "Digite RESET para prosseguir (qualquer outra coisa cancela): " CONFIRM
if [ "$CONFIRM" != "RESET" ]; then
  echo "Cancelado pelo operador." >&2
  exit 6
fi

# ---------------------------------------------------------------------------
# Executa via Node — reusa pool/dotenv do app + helpers existentes
# ---------------------------------------------------------------------------
EMAIL="$EMAIL" MOTIVO="$MOTIVO" OPERATOR_EMAIL="$OPERATOR_EMAIL" \
  node "$ROOT/scripts/ops/disable-admin-2fa.runner.js"
RC=$?

if [ "$RC" -eq 0 ]; then
  echo
  echo "OK — 2FA desativado. Audit log registrado. Admin alvo deve refazer setup no próximo login."
elif [ "$RC" -eq 10 ]; then
  echo
  echo "INFO — admin alvo já estava sem 2FA. Audit log registrado mesmo assim (idempotência)."
  exit 0
else
  echo
  echo "ERRO — operação falhou. Veja a mensagem acima." >&2
  exit "$RC"
fi
