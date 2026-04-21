# Direitos dos Titulares — Kavita

Operacionalização do art. 18 da LGPD. Cada direito abaixo tem um
canal e um SLA interno.

> **Prazo legal de resposta:** 15 dias (LGPD art. 19 §1º), contados
> da solicitação completa.

---

## Os 9 direitos (art. 18)

| # | Direito | Canal | Cumprido como? |
|---|---|---|---|
| I | Confirmação da existência de tratamento | Painel "Meus dados" ou `/privacidade` → contato | Página mostra exatamente quais dados temos do titular |
| II | Acesso aos dados | Painel "Meus dados" → "Baixar meus dados" | Export JSON imediato com projeção segura (sem senha/token) |
| III | Correção | Painel "Perfil" (nome, telefone, email) | Usuário edita diretamente; mudanças auditadas |
| IV | Anonimização / bloqueio / eliminação de dados desnecessários | Painel → "Pedir exclusão" | Fluxo assíncrono com janela de 30 dias |
| V | Portabilidade | Painel → "Baixar meus dados" em JSON | Formato universal; interoperável entre serviços |
| VI | Eliminação de dados tratados com consentimento | Painel → "Pedir exclusão" | Anonimiza conta + revoga consentimentos |
| VII | Informação sobre compartilhamento | `/privacidade` (seção "Com quem compartilhamos") | Lista todos os provedores (ClickSign, Asaas, etc) |
| VIII | Informação sobre não fornecimento de consentimento | `/privacidade` seção "Consentimento" | Explica o que deixa de funcionar se negar |
| IX | Revogação do consentimento | Painel → opt-out de cada tratamento opcional | Alertas, SMS, cookies não-essenciais cada um tem toggle |

---

## Canais de solicitação

### 1. Self-service (painel autenticado)
`/painel/produtor/meus-dados` → opção de exportar, excluir, editar.
**SLA interno: instantâneo** para exportação; **30 dias** para
exclusão (janela de arrependimento).

### 2. Canal público (não autenticado)
`/privacidade` → formulário → grava em `mensagens_contato` com
`assunto = 'privacidade'`.
**SLA interno: 10 dias úteis** para primeira resposta (buffer para
15 dias legais).

### 3. Email direto
`privacidade@kavita.com.br` (env `NEXT_PUBLIC_PRIVACY_EMAIL`).
Encaminhado para DPO; resposta manual.

---

## Fluxo de tratamento interno

```
Solicitação chega → privacy_requests (pending)
                      │
                      ▼
              Admin avalia em 2 dias úteis
                      │
         ┌────────────┴────────────┐
         ▼                         ▼
    Válida                    Inválida/retida
         │                         │
         ▼                         ▼
  scheduled_purge_at = +30d     status = 'retained' + motivo
         │                         │
         ▼                         ▼
    Email de confirmação      Email explicando retenção
    com prazo e link de cancelamento
         │
         ▼ (após 30 dias)
    Job executa anonimização
    status = 'completed'
```

---

## Verificação de identidade

Antes de executar export/delete, confirmamos que a requisição vem
do titular real:

- **Via painel autenticado:** cookie HttpOnly já prova — não pedimos
  mais nada.
- **Via canal público:** exigimos que o email da solicitação bata
  com um email conhecido de titular. Se não bater, respondemos
  explicando como criar conta e solicitar pelo painel.

---

## Exceções — quando podemos recusar

Art. 18 §4º permite recusa quando:

1. Obrigação legal/regulatória (NF retida por 5 anos)
2. Exercício de direitos em processo judicial/administrativo
3. Prevenção de fraude (fraude ativa em andamento)
4. Interesse público ou legítimo pré-ponderante

Toda recusa vira `status = 'retained'` com motivo detalhado no
campo `status_reason`. O titular é informado por email com
fundamento legal e pode recorrer.

---

## Template de PR que toca dado pessoal

Toda PR que adiciona tabela, coluna ou rota lidando com PII deve:

- [ ] Atualizar `mapa-de-dados.md` com a nova entidade
- [ ] Classificar risco e base legal
- [ ] Definir retenção em `retencao.md`
- [ ] Se for endpoint público, validar que resposta **não** vaza
      dados de outros titulares (IDOR test)
- [ ] Se for endpoint de exportação, confirmar via código que
      `senha`, `password_hash`, `totp_secret`, `cpf`, `cpf_hash` e
      tokens **não** aparecem na projeção
