# Estratégia de expansão por regiões cafeeiras

Atualizado em 2026-04-21.

---

## 1. Posicionamento

**Kavita é a plataforma vertical para corretoras de café do Brasil.**
Nascemos na Zona da Mata Mineira, onde fizemos a primeira validação do
rito completo (diretório → CRM → KYC/AML → contrato digital → verificação
pública). Estamos preparados para atender corretoras e produtores em
qualquer região produtora de café do país.

**A plataforma é vertical de café.** Não é SaaS genérico de agro. A
especialização é parte do produto: catálogo de tipos de café, cotações
CEPEA/ICE, calendário de safra, Denominações de Origem, padrões
sensoriais e rito comercial são todos orientados pela realidade do café.

---

## 2. Praça piloto: Zona da Mata / Manhuaçu

A Zona da Mata MG é a primeira praça validada. A corretora-âncora do
piloto é conduzida em Manhuaçu (Laert). Todo o aprendizado de linguagem,
UX, gate KYC e rito de contrato foi calibrado nesse recorte.

**Isso está preservado no código:**
- Cidades iniciais de `src/lib/regioes.ts` são da Zona da Mata MG
- Manhuaçu é cidade-bandeira (`destaque: true`)
- Doc histórica `docs/regionalizacao-manhuacu.md` descreve as decisões
  regionais que deram origem ao produto

**O que mudou:** o catálogo é agora **nacional** por design. Novas
cidades e regiões foram adicionadas ao catálogo inicial para sinalizar
a abertura. A expansão comercial real (marketing, aquisição, suporte)
permanece controlada por fases.

---

## 3. Regiões-alvo

Codificadas em `REGIOES` (`src/lib/regioes.ts`):

| Código | Nome | Estados | Característica |
|---|---|---|---|
| `zona_mata_mg` | Zona da Mata | MG | Praça piloto, arábica bebida dura/mole, corretagem local tradicional |
| `matas_minas` | Matas de Minas | MG | Denominação de Origem, arábica de qualidade sensorial diferenciada |
| `sul_minas` | Sul de Minas | MG | Maior bacia produtora de arábica do país, forte cooperativismo |
| `cerrado_mg` | Cerrado Mineiro | MG | Denominação de Origem, arábica de altitude mecanizado |
| `mogiana_sp` | Mogiana | SP | Tradição paulista, café de altitude e terroir |
| `caparao_mg_es` | Caparaó | MG/ES | Altitude, cafés especiais premiados |
| `es_conilon` | Espírito Santo (Conilon) | ES | Maior produtor nacional de conilon (robusta) |
| `sul_bahia` | Sul da Bahia | BA | Cerrado baiano e região costeira, em expansão |

---

## 4. Critérios para liberar nova região

Antes de abrir a plataforma publicamente em uma nova região, os 5
critérios abaixo precisam estar atendidos:

1. **1 corretora âncora** disposta a operar como beta por 60 dias
2. **Ticker compatível** com a cafeicultura da região (CEPEA Arábica
   cobre MG/SP/ES/BA arábica; conilon exige outra fonte — ainda não
   plugada no `marketQuotesService`)
3. **Pelo menos 5 cidades da região** no catálogo `CIDADES`
4. **Validação de terminologia local** — o UX foi testado com pelo menos
   1 produtor e 1 corretora da região (ex.: "saca" é universal; "arroba"
   não se aplica a café; "ensacado" vs "a granel" varia)
5. **Suporte com capacidade** para atender a nova praça nos primeiros 30d
   sem comprometer a praça anterior

---

## 5. Como o admin controla corretoras por região

A operação admin é totalmente agnóstica de região:

- **Listagem admin** (`/admin/mercado-do-cafe/corretoras`) — já tem
  filtro por estado e cidade (string livre)
- **Campo `region`** em `corretoras` — string livre (`VARCHAR`), aceita
  "Sul de Minas", "Cerrado Mineiro", "Zona da Mata" ou qualquer outro
  texto; sem migration necessária
- **`cidades_atendidas`** — JSON array de slugs, aceita cidades de
  qualquer estado
- **`regional_highlight`** — capability de plano (Premium); independente
  da região — corretora Premium do Sul de Minas ganha destaque na sua
  região igual a uma da Zona da Mata
- **KYC/AML** — FSM 100% agnóstica de região; o mock adapter funciona
  para qualquer CNPJ brasileiro; BigDataCorp (quando plugado) também

**O que ainda exige SQL manual:** nada. Admin pode cadastrar corretora
de qualquer UF pela UI existente.

---

## 6. Riscos de expandir cedo demais

| Risco | Severidade | Mitigação |
|---|---|---|
| Produto não testado com corretora de fora da ZM | Alta | Manter ZM como piloto formal até 3+ contratos assinados; só depois convidar 2ª região |
| Ticker CEPEA/ICE não cobre conilon | Alta | ES conilon só abre depois de plugar cotação adequada |
| Catálogo de cidades sem cobertura | Média | String livre em `city` já permite cidade fora do catálogo; UX só fica mais pobre (sem slug canônico) |
| Copy universal perde identidade | Média | Manter "nascido na Zona da Mata" como storytelling — é credibilidade, não limitação |
| Suporte sobrecarregado | Alta | Definir SLA por região; expandir só quando tem capacidade |
| Concorrência regional instalada | Baixa | Sul de Minas tem ERPs locais consolidados; entrar por nicho específico (corretora de CNPJ auditado + contrato digital) evita choque frontal |
| Marketing virar commodity | Média | Investir em conteúdo específico por região em vez de genérico |
| Dinâmicas regionais divergentes | Alta | Sul de Minas é cooperativista; ZM é corretor independente; ES é conilon; reconhecer e respeitar cada modelo |

---

## 7. O que NÃO muda no sistema

A abertura nacional é de copy e dados — não de arquitetura. As seguintes
pedras angulares **permanecem idênticas**:

- Schema do banco (estado aceita qualquer UF, região é string livre)
- FSM KYC e gate de contrato
- ClickSign v3 + webhook HMAC
- Asaas (planos) e Mercado Pago (loja)
- RBAC admin e auditoria
- LGPD 2.0 (direitos do titular, DPO)
- Autenticação (4 contextos: admin / usuário loja / corretora / produtor)
- Planos e capabilities (`max_users`, `leads_export`, `regional_highlight`,
  `advanced_reports`)
- Ticker CEPEA (já funciona para arábica em qualquer praça)
- Templates de contrato (CV Disponível / CV Entrega Futura)

Para ES conilon, a única integração pendente é uma **fonte de cotação
conilon**. Tudo o mais já funciona.

---

## 8. Referências

- [regionalizacao-manhuacu.md](./regionalizacao-manhuacu.md) — doc
  histórica da primeira praça
- [corretora-modulo.md](./corretora-modulo.md) — doc canônica do módulo
- [roadmap-fase-10-entregue.md](./roadmap-fase-10-entregue.md) — entregas
  recentes (contrato digital, KYC, LGPD 2.0, ticker CEPEA)
- `src/lib/regioes.ts` — fonte única do catálogo de cidades e regiões
- Cofre Obsidian `kavita-os/SaaS Corretora Café/Estratégia de Regiões Cafeeiras.md`
