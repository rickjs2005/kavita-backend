# Bases Legais do Tratamento — Kavita

Mapeamento das bases do art. 7º da LGPD efetivamente usadas pelo
Kavita, por finalidade de tratamento. Revisar em conjunto com
`mapa-de-dados.md`.

> **Princípio guia:** toda base legal precisa ser específica,
> documentada e mostrada ao titular quando ele perguntar. Não
> invocamos "legítimo interesse" como base de conveniência — quando
> usamos, fazemos teste de balanceamento (ver `ripd.md`).

---

## Art. 7º — Dados pessoais comuns

### I — Consentimento

**Quando:** captação de leads (`corretora_leads.consentimento_contato`),
opt-in de SMS (`sms_optin`), opt-in de alertas
(`producer_alert_subscriptions`), aceite de termos/privacidade.

**Como é coletado:**
- Captura de lead: checkbox explícito no formulário público, não
  pré-marcado, com texto vinculando o aceite ao compartilhamento
  com a corretora.
- Opt-in SMS: checkbox separado do consentimento principal.
- Alertas: produtor cria a inscrição proativamente.

**Como é revogado:**
- Formulário de privacidade (`/privacidade` → contato) ou link de
  `unsubscribe` no email, quando aplicável.
- No painel do produtor: botão "excluir alertas".
- Exclusão de conta: anonimiza/revoga todos os consentimentos.

---

### II — Cumprimento de obrigação legal ou regulatória

**Quando:** retenção de pedidos, notas fiscais, dados tributários.

**Fundamento:** Art. 173 CTN (prescrição tributária, 5 anos),
regulamentações contábeis e fiscais aplicáveis. Não podemos apagar
dados da nota fiscal pelo simples pedido do titular — o controlador
tem obrigação legal de preservá-los pelo prazo legal (LGPD art. 16
I permite essa retenção mesmo após pedido de exclusão).

---

### V — Execução de contrato ou procedimentos preliminares

**Quando:** autenticação de usuário/produtor/corretora, processamento
de pedido, comunicação transacional (confirmação de pedido, envio
de magic link, notificação de lead), emissão de contrato CV café
(Fase 10.1).

**Observação:** base V dispensa consentimento — o titular já optou
pelo serviço quando criou a conta. Mas **não** dispensa transparência:
a página `/privacidade` descreve todos esses tratamentos.

---

### VI — Exercício regular de direitos

**Quando:** defesa em processo administrativo/judicial, retenção de
evidências de negociação (timeline do lead, audit log de mudanças
em contrato).

---

### IX — Interesse legítimo

**Quando:** prevenção de fraude (rate limit por IP, log de
user-agent em formulário público), métricas internas de qualidade
do serviço (SLA por corretora), recomendação de corretoras por
matching geográfico.

**Teste de balanceamento aplicado:**
1. Finalidade específica ✓ (descrita em `ripd.md`)
2. Necessidade: poderia ser alcançada com menos dado? Onde possível,
   sim — por exemplo, anonimizamos IP após 90d no webhook_events.
3. Contrapeso: direitos do titular preservados via painel "Meus
   dados" (exportar/excluir).

---

## Art. 11 — Dados pessoais **sensíveis**

Kavita **não trata dados sensíveis** no fluxo principal (saúde,
religião, biometria, etc). A única exceção potencial futura é **KYC
biométrico** (selfie matching) na Fase 10.2 — quando entrar, será
tratado com base em consentimento específico (art. 11 I) e migração
deste documento para incluir.

---

## Alterações futuras

| Fase | Nova base | Razão |
|---|---|---|
| 10.2 (KYC/AML) | Art. 7º II + Art. 11 I | Due diligence regulatória + eventual biometria facial |
| 11.1 (Escrow) | Art. 7º V | Dados bancários para repasse |
| 11.2 (NFPe/NFe) | Art. 7º II | Obrigação fiscal com SEFAZ |

Cada evolução passa por atualização deste arquivo antes de merge
em main.
