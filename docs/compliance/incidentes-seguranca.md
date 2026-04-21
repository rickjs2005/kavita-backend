# Plano de Resposta a Incidentes de Segurança

Procedimento interno para tratamento de incidentes envolvendo dados
pessoais, em linha com a LGPD (art. 48) e a regulamentação da ANPD.

> ⚠️ **Sobre prazos de comunicação à ANPD:** o art. 48 §1º da LGPD
> determina que o controlador comunique à autoridade e aos
> titulares "em prazo razoável". A ANPD vem editando
> regulamentação específica (resoluções e guias) que detalham
> procedimento e prazos — consultar em cada incidente o regulamento
> vigente no site oficial da ANPD antes de cravar prazo interno.
> Este documento **não cita número específico de dias** para não
> induzir a erro; o DPO consulta o regulamento no momento da
> avaliação do incidente.

---

## 1. O que caracteriza um incidente

- Acesso não autorizado a dado pessoal (leak, dump, breach)
- Alteração indevida (tampering)
- Destruição ou perda de dado pessoal
- Exposição acidental (log com PII em sistema público, URL
  indexada pelo Google contendo dado, etc.)
- Comprometimento de credencial administrativa
- Compromisso de provedor externo que hospeda dado do Kavita

Pequenos erros de software **que não expuseram dado pessoal** não
são incidentes LGPD — são bugs.

---

## 2. Fluxo de resposta

```
Detecção → Contenção → Avaliação → Notificação (se aplicável) →
Remediação → Lições aprendidas
```

### 2.1. Detecção
Fontes esperadas:
- Alertas de Sentry (erro em produção)
- Logs de `adminAuditService` (alteração suspeita)
- Denúncia de usuário/titular
- Pesquisador externo (responsible disclosure via
  `privacidade@kavita.com.br`)

### 2.2. Contenção (primeiras 2 horas)
Ação imediata do engenheiro de plantão:
- [ ] Revogar credencial comprometida (incrementar `token_version`)
- [ ] Desligar feature afetada via env flag (se aplicável)
- [ ] Restringir acesso ao recurso exposto
- [ ] Preservar evidência: snapshot de logs, queries relevantes,
      request IDs do Sentry — **nunca apagar** antes da avaliação

### 2.3. Avaliação (até 24 horas)
DPO + engenheiro responsável preenchem o checklist abaixo.

---

## 3. Checklist de avaliação (preencher no ticket interno)

- [ ] **Qual dado foi afetado?** (usar categorias do
      `mapa-de-dados.md`)
- [ ] **Quantos titulares impactados?** (número ou faixa)
- [ ] **Natureza e origem do incidente** (técnica, humana,
      provedor)
- [ ] **Dados estavam criptografados/anonimizados?** (se sim, risco
      cai drasticamente)
- [ ] **Houve efetiva exposição ou apenas risco potencial?**
      (diferença crítica)
- [ ] **Risco de dano aos titulares:**
  - Patrimonial? (fraude financeira, uso indevido de CPF)
  - Moral? (exposição de mensagem privada)
  - Reputacional?
  - À segurança física? (endereço)
- [ ] **Há obrigação de comunicação à ANPD?** LGPD art. 48 —
      quando pode acarretar risco ou dano relevante. Consultar
      regulamento ANPD vigente para prazo e forma.
- [ ] **Há obrigação de comunicação aos titulares?** Mesmo critério
      — risco/dano relevante.
- [ ] **Provedor externo envolvido?** Acionar o DPA do operador.

---

## 4. Comunicação

### À ANPD
Quando aplicável (risco ou dano relevante conforme art. 48),
usar o formulário oficial disponibilizado pela ANPD. Consultar o
site oficial no momento do incidente para:
- Formulário atualizado de comunicação
- Campos obrigatórios
- Prazo máximo atualizado pela regulamentação vigente

### Aos titulares
Canal primário: email cadastrado. Se não houver email ativo, canal
público (`/privacidade` → aviso na página por período adequado).

**Template mínimo (ajustar ao caso):**

> Prezado(a) [nome],
>
> Identificamos um incidente de segurança em [data] envolvendo
> [categoria de dado]. [O que aconteceu em 2 frases]. Este incidente
> [pode/não pode] impactar você. [Ações que recomendamos: trocar
> senha, monitorar conta, etc].
>
> Já tomamos as seguintes medidas: [lista].
>
> Estamos à disposição em privacidade@kavita.com.br para qualquer
> dúvida. Você tem direito de peticionar à ANPD
> (anpd.gov.br/peticionamento).

---

## 5. Remediação

- [ ] Correção técnica implementada e em produção
- [ ] Teste de regressão que cubra o vetor do incidente
- [ ] Rotação de credenciais se aplicável
- [ ] Patch de provedor externo confirmado

## 6. Lições aprendidas

Registrar em `docs/compliance/incidents/YYYY-MM-DD-slug.md`:
- Timeline completa (detecção → remediação)
- Causa raiz
- Por que não foi detectado antes
- Medidas adotadas para não repetir
- Impacto real em titulares

---

## 7. Papéis e responsabilidades

| Papel | Responsabilidade |
|---|---|
| Engenheiro de plantão | Detecta, contém, preserva evidência |
| DPO | Coordena avaliação, decide sobre comunicação à ANPD/titulares |
| CTO / Tech lead | Aprova medidas de contenção e remediação |
| Jurídico | Valida comunicação à ANPD antes do envio |
| Comunicação | Template e envio aos titulares |

Se a equipe ainda não tem esses papéis formalizados, o fundador
acumula provisoriamente. Formalizar antes do lançamento comercial.

---

## 8. Exercícios

Trimestralmente: simulação de incidente (tabletop exercise) com o
time técnico para manter o procedimento vivo. Registrar resultado
nos mesmos moldes da seção 6.
