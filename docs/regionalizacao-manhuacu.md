# Regionalização Manhuaçu / Zona da Mata

> **Documento histórico.** Descreve a praça piloto Manhuaçu / Zona da Mata.
> O posicionamento atual da SaaS é **nacional** para corretoras de café,
> mantendo a Zona da Mata como origem e primeira validação. Para a
> estratégia de expansão por regiões cafeeiras, ver
> [estrategia-regioes.md](./estrategia-regioes.md).

Documenta os ajustes do módulo Mercado do Café para a realidade operacional
de Manhuaçu e das Matas de Minas. Decisões de produto, copy e UX que
deram origem ao sistema. As decisões aqui descritas continuam vigentes
como fundação do produto — outras regiões herdam os mesmos princípios.

## Princípios

1. **Palavra vale** — o sistema reforça a reputação do responsável (nome em destaque, anos de atuação, cidades que atende). Não esconde quem está do outro lado.
2. **Linguagem do terreiro** — o produtor fala em "córrego", "tulha", "safra", "saca". A interface também.
3. **Retorno rápido importa mais que feature** — SLA de primeira resposta é o KPI número 1 da corretora.
4. **Mobile é regra, não exceção** — produtor está em campo; corretor está no balcão do armazém.

## O que foi ajustado (2026-04-15)

### Página pública da corretora

- **Kicker do hero**: `Corretora verificada · Matas de Minas` (antes era só "Corretora verificada").
- **Atuação dinâmica** no aside: respeita `perfil_compra` (compra / venda / ambos).
- **Trust block regional** novo — `CorretoraRegionalTrust`, 4 cards: Responsável, Atua em, Resposta média, Rede Kavita Verificada.
- **Copy da seção 03** (formulário) mudou:
  - Título: "Fale sobre seu café" (antes "Envie uma mensagem").
  - Subtítulo cita "tulha" e "canal que você preferir".
  - Pitch editorial lateral passa a falar de córrego/safra/volume e reforça "sem intermediário, sem taxa".
  - Trust bullets expandidos para 4 itens, com tom regional ("cadastro rápido pelo celular").
- **CTA primário** do formulário: `Falar com a corretora` (antes "Enviar mensagem").
- **Toasts**: "Mensagem enviada — a corretora já foi avisada e retorna em breve."
- **Tela de sucesso** pós-envio: "Contato enviado" + copy que sugere WhatsApp direto se tiver pressa.

### Catálogo de opções

- `OBJETIVOS_CONTATO`:
  - "Vender café" → **"Vender meu café"**
  - "Comprar café" → **"Quero comprar"**
  - "Consultar cotação" → **"Saber o preço da saca"**
- Linguagem mais conversacional, mais próxima do que o produtor escreveria.

### Painel da corretora

- Novo componente `NextActionChip` aplicado em cada linha do `LeadsTable`:
  - `status=new` + idade ≥ 2h → **Responder agora** (rosa, urgente).
  - `status=new` recente → **Primeiro contato**.
  - `amostra_status=prometida` → **Cobrar amostra**.
  - `amostra_status=recebida` → **Levar para cata**.
  - `status=contacted` sem movimento ≥ 48h → **Reaquecer contato**.
- Reduz a fricção de olhar o inbox e pensar "o que faço agora?". Cada lead diz o próximo passo.

### Estado vazio das avaliações

- Copy passa a convidar: "Já negociou com esta corretora? Conte como foi — sua avaliação ajuda outros produtores da região a decidirem com segurança."

## Componentes novos

| Arquivo | Papel |
|---|---|
| `components/mercado-do-cafe/CorretoraRegionalTrust.tsx` | Trust block regional (responsável, cidades, SLA, verificação) |
| `components/painel-corretora/NextActionChip.tsx` | Sugestão contextual de próxima ação no inbox |

## Arquivos alterados

- `src/app/mercado-do-cafe/corretoras/[slug]/page.tsx` — kicker, atuação dinâmica, trust block, copy seção 03.
- `src/components/mercado-do-cafe/LeadContactForm.tsx` — CTA, toast, sucesso.
- `src/components/mercado-do-cafe/CorretoraReviews.tsx` — empty state regional.
- `src/components/painel-corretora/LeadsTable.tsx` — integração NextActionChip.
- `src/lib/regioes.ts` — labels de `OBJETIVOS_CONTATO`.

## Pendências de próxima iteração

1. **SLA medido real** (`sla_medio_horas`) — hoje o trust block cai no fallback "No mesmo dia". Expor endpoint `/api/public/corretoras/:slug/stats` com SLA calculado dos últimos 30 dias.
2. **Contador público de produtores atendidos** (`produtores_atendidos`) — requer métrica derivada de `corretora_leads` agregada por `telefone_normalizado` distinct.
3. **Badge "Café de Montanha"** — depende de lookup de altitude por córrego na tabela curada (futura `corregos_manhuaco`).
4. **Filtro por córrego/cidade no inbox** — UI no LeadsTable.
5. **Widget regional no dashboard da corretora** — "X leads de Manhuaçu esta semana" / "top 3 córregos ativos".
6. **Captura GPS nativa** no cadastro de lote — quando o módulo de lotes for aberto.

## Princípios para futuras mudanças

- Nunca adicionar feature que exige explicação de 3 frases para o produtor entender.
- Copy em português falado, não traduzido. "Vender meu café" > "Formulário de intenção de venda".
- Toda melhoria passa pelo teste: *"um corretor de 55 anos no armazém usaria isso no Android dele?"*
