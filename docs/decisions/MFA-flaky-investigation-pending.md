# MFA Flaky Test — Investigação pendente

**Status:** Reportado, investigação interrompida por fadiga de sessão
**Descoberto:** 2026-04-27, fim da Sessão C

## Sintoma

Teste "200 — fluxo completo MFA (login → mfa)" em
test/integration/controllers/authAdminController.int.test.js
falha intermitentemente.

- Falhou no baseline da Sessão B
- Passou em rodadas finais das Sessões A e B
- Comportamento inconsistente entre runs

## Hipótese (não validada)

State pollution entre testes. Suspeita de variável module-level
em authAdminController.js ou mfaService.js (Map de challenges
não resetado entre testes).

## Risco em produção (a investigar)

Se a hipótese for state global compartilhado entre requisições em
produção, há risco de vazamento de challenge MFA entre admins
diferentes — Categoria B (bug real, não só teste).

## Não fazer até sessão dedicada

Investigação requer cabeça fresca + isolamento. Não atacar em
paralelo a outro trabalho.

## Próxima ação (sessão dedicada, ~1-2h)

1. Reproduzir flakiness isolado vs suite completa
2. Identificar state global suspeito
3. Determinar se é Categoria A (teste mal isolado) ou B (bug)
4. Tratar conforme categoria
