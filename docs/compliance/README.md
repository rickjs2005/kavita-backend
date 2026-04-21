# Compliance — Kavita

Documentos de privacidade e proteção de dados. Fase 10.3 do roadmap
(LGPD 2.0) entregou a base desta pasta.

## Arquivos

| Arquivo | Conteúdo |
|---|---|
| [mapa-de-dados.md](mapa-de-dados.md) | Inventário de tabelas com PII + base legal + risco por tabela |
| [bases-legais.md](bases-legais.md) | Como o Kavita usa cada inciso do art. 7º da LGPD |
| [retencao.md](retencao.md) | Prazo de guarda por categoria + regras de anonimização |
| [direitos-dos-titulares.md](direitos-dos-titulares.md) | Art. 18 operacionalizado — canais, SLA, templates |
| [ripd.md](ripd.md) | Relatório de Impacto — avaliação de riscos + controles |
| [incidentes-seguranca.md](incidentes-seguranca.md) | Fluxo de resposta a incidente de segurança |

## Quando atualizar

- **Nova tabela com PII**: atualizar `mapa-de-dados.md` e `retencao.md`
- **Novo provedor externo recebendo PII**: atualizar `ripd.md` seção 2
- **Incidente de segurança**: seguir fluxo em `incidentes-seguranca.md`,
  registrar em `docs/compliance/incidents/YYYY-MM-DD-slug.md`
- **Mudança de bases legais invocadas**: atualizar `bases-legais.md`

Ver template de PR em `direitos-dos-titulares.md` — seção final.

## Responsáveis

| Papel | Responsável atual |
|---|---|
| DPO / Encarregado | A designar formalmente antes do lançamento comercial |
| Canal de privacidade | `privacidade@kavita.com.br` (env `NEXT_PUBLIC_PRIVACY_EMAIL`) |
| Resposta a incidente | Engenheiro de plantão + DPO (fluxo em `incidentes-seguranca.md`) |
