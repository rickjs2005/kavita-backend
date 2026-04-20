# Templates de Contrato — Fonte da Verdade Jurídica

Este documento versiona as cláusulas-base dos dois tipos de contrato
gerados pela Kavita (Fase 10.1). Quando o jurídico revisar uma
cláusula, editar aqui **antes** de tocar o `.hbs` correspondente — a
diff fica rastreável no git e o template Handlebars apenas renderiza
o que está documentado.

- Última revisão: 2026-04-20
- Status jurídico: **rascunho operacional** (pendente review formal
  de advogado antes do primeiro contrato real)

---

## Arquivos relacionados

| Documento | Caminho | Função |
|---|---|---|
| Layout base | `templates/contratos/_base.hbs` | Cabeçalho, rodapé, QR Code, hash |
| Tipo disponível | `templates/contratos/cv-disponivel.hbs` | Bica corrida, entrega curta |
| Tipo entrega futura | `templates/contratos/cv-entrega-futura.hbs` | Contrato a termo |
| Gerador | `services/contratoService.js` | Compila + Puppeteer + SHA-256 |

---

## A. Compra e Venda de Café Disponível (Bica Corrida / Tipo)

Aplicável quando o café já foi colhido e o Vendedor pode entregar em
prazo curto, com preço fixo fechado no ato.

### Campos dinâmicos obrigatórios

| Variável | Tipo | Validação Zod | Exemplo |
|---|---|---|---|
| `safra` | string | min 4, max 20 | `2025/2026` |
| `bebida_laudo` | string | min 2, max 80 | `Dura` |
| `quantidade_sacas` | int positivo | <= 100000 | `200` |
| `preco_saca` | decimal positivo | <= 100000 | `1450.00` |
| `prazo_pagamento_dias` | int 0–180 | — | `15` |
| `nome_armazem_ou_fazenda` | string | min 2, max 200 | `Armazém Geral Manhuaçu` |
| `id_amostra` | string opcional | max 60 | `AMO-2026-0123` |
| `observacoes` | string opcional | max 1000 | — |

### Cláusulas

1. **Objeto** — café em grão verde, safra X, tipo/bebida do laudo.
2. **Quantidade e preço** — N sacas de 60kg líquidos, R$ X/saca,
   valor total = N × preço, prazo de pagamento em dias úteis após
   entrega e classificação definitiva.
3. **Local de entrega** — armazém ou fazenda identificada. Risco do
   transporte corre pelo Vendedor até o recebimento.
4. **Qualidade e amostra** — direito de recusa se classificação física
   divergir materialmente da amostra referenciada. Classificação
   definitiva por classificador credenciado.
5. **Mora e foro** — multa de 10% sobre valor total em caso de
   inadimplemento, perdas e danos, foro da comarca da Compradora.
6. **Observações** (opcional) — bloco livre acordado entre as partes.

---

## B. Compra e Venda para Entrega Futura (Contrato a Termo)

Aplicável quando a safra ainda está sendo formada e o preço é
referenciado ao indicador CEPEA/ESALQ com diferencial (basis).

### Campos dinâmicos obrigatórios

| Variável | Tipo | Validação Zod | Exemplo |
|---|---|---|---|
| `safra_futura` | string | min 4, max 20 | `2026/2027` |
| `bebida_laudo` | string | min 2, max 80 | `Dura (referência sensorial)` |
| `quantidade_sacas` | int positivo | <= 100000 | `500` |
| `diferencial_basis` | decimal | -1000 a 1000 | `-25.00` |
| `data_referencia_cepea` | string AAAA-MM-DD | regex | `2026-04-20` |
| `nome_armazem_ou_fazenda` | string | min 2, max 200 | `Fazenda Santa Rita` |
| `id_amostra` | string opcional | max 60 | — |
| `observacoes` | string opcional | max 1000 | — |

### Cláusulas

1. **Objeto** — entrega futura de café arábica safra X, especificação
   sensorial de referência.
2. **Quantidade e preço base** — N sacas de 60kg, preço base = indicador
   CEPEA/ESALQ do arábica na data de referência + diferencial (basis)
   por saca. Liquidação sobre a quantidade efetivamente entregue.
3. **Qualidade e amostra** — direito de recusa por divergência material.
4. **Cláusula de Washout (multa por não entrega)** — 20% sobre o valor
   de mercado no dia do vencimento, acrescida de perdas e danos, salvo
   força maior (geada, seca extrema) com laudo técnico.
5. **Natureza do título** — título executivo extrajudicial para fins
   do CPC.
6. **Mora e foro** — comarca da sede da Compradora.
7. **Observações** (opcional) — bloco livre.

---

## Verificação de autenticidade

Todo PDF gerado leva no rodapé:

- **QR Code** apontando para `APP_URL/verificar/:token` (UUID v4)
- **Hash SHA-256** do binário do PDF calculado no momento da geração
- **Número externo** `KVT-<base36(timestamp)>` no topo

A página `/verificar/:token` (frontend, PR 3) consome
`GET /api/public/verificar-contrato/:token` e mostra:

- Corretora (nome + slug)
- Tipo do contrato
- Status atual (draft / sent / signed / cancelled / expired)
- Hash SHA-256 completo
- Data de assinatura (se `signed`)
- Resumo anônimo: safra, quantidade de sacas, nome do produtor

**Nunca vaza** telefone, email, preço fechado ou endereço completo.

---

## Lista de pendências para "produção jurídica"

- [ ] Review formal do template por advogado especializado em agro
- [ ] Incluir cláusula de LGPD mínima (tratamento de dados do
      produtor na plataforma) se o jurídico achar apropriado
- [ ] Campo opcional de testemunhas (precisa de 2 para força
      executiva em alguns casos)
- [ ] Anexo de laudo sensorial (quando Fase 12 chegar)
- [ ] Versão bilíngue PT/EN para operações de exportação (Fase 12)
