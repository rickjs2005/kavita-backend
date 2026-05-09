# Política de Privacidade — Kavita

**Versão:** 1.0.0
**Vigência:** a partir de 2026-05-08
**Última revisão:** 2026-05-08
**Encarregado de Dados (DPO):** dpo@kavita.com.br

> **Aviso — versão preliminar.** Esta política está em vigor enquanto a
> Kavita opera em fase de validação controlada (staging). Os dados
> institucionais completos (razão social, CNPJ, endereço fiscal e
> identificação formal do(a) Encarregado(a) de Dados) serão divulgados
> nesta mesma página antes do início da operação comercial definitiva,
> com aviso prévio e nova versão semver. A vigência das cláusulas de
> proteção, segurança e direitos do titular começa imediatamente. O
> canal **dpo@kavita.com.br** está ativo desde já.

---

## 1. Quem é o Controlador

Para efeitos da Lei Geral de Proteção de Dados (LGPD, Lei 13.709/2018):

- **Para dados de cadastro de cliente da loja, corretora e visitante**: Kavita é a **Controladora**.
- **Para o lead que o produtor envia a uma corretora específica**: a **corretora destinatária é a Controladora** dos dados após o recebimento; a Kavita atua como **Operadora**, processando o dado para entregá-lo à corretora e oferecer ferramentas de gestão. A corretora deve ter sua própria política de privacidade.

Operador: **Kavita** — nome fantasia da plataforma, em fase de validação
controlada. Sede operacional: **Manhuaçu, Minas Gerais**. A razão social e
CNPJ definitivos serão divulgados nesta página antes do início da operação
comercial definitiva.

## 2. Que dados coletamos

### Diretamente do titular

| Fluxo | Dados coletados |
|---|---|
| Cadastro de cliente da loja (`/register`) | nome, e-mail, CPF, senha (hash), data de cadastro |
| Cadastro de corretora (`/mercado-do-cafe/corretoras/cadastro`) | razão social, responsável, CNPJ (após KYC), e-mail, telefone, WhatsApp, cidade, estado, redes sociais, logo |
| Lead do produtor (`/mercado-do-cafe/corretoras/{slug}#fale-corretora`) | nome, telefone, e-mail (opcional), cidade, córrego/localidade, tipo de café, volume estimado, mensagem |
| Formulário Drones (`/drones`) | nome, telefone, cidade, modelo de interesse, mensagem |
| Comentários/avaliações | nome de usuário (logado), texto, mídias enviadas |

### Coletados automaticamente

- Endereço IP, user-agent (navegador/SO), timestamp de cada interação relevante.
- Cookies estritamente necessários para autenticação (`auth_token`, `adminToken`, `corretoraToken`, `producerToken`) e proteção CSRF (`csrf_token`).
- Em painéis logados: registro de auditoria com data/hora e ação realizada.

### NÃO coletamos

- Dados de cartão de crédito (são processados diretamente pelo Mercado Pago / Asaas; a Kavita só recebe um identificador opaco do gateway).
- Dados de localização precisa (GPS) sem consentimento explícito específico (ex.: PWA do motorista).
- Dados de menores de 18 anos sem autorização parental.

## 3. Para que usamos seus dados (finalidades e bases legais)

| Finalidade | Base legal | Retenção |
|---|---|---|
| Operar sua conta e processar pedidos | Execução de contrato (LGPD art. 7º, V) | enquanto a conta existir + 5 anos para fins fiscais |
| Compartilhar lead com corretora destinatária | Consentimento do titular (art. 7º, I) | até a corretora marcar como fechado/perdido + 24 meses |
| Verificar regularidade de CNPJ da corretora (KYC) | Obrigação regulatória (art. 7º, II) e legítimo interesse | 5 anos após fim da relação contratual |
| Detectar fraude e proteger a plataforma | Legítimo interesse (art. 7º, IX) | 12 meses |
| Comunicar atualizações sobre seu pedido/lead/conta | Execução de contrato | enquanto a relação existir |
| Marketing direto (e-mails comerciais) | Consentimento separado e específico — opt-in | até descadastramento |
| Cumprir obrigação legal (notas fiscais, requisições judiciais) | Obrigação legal (art. 7º, II) | conforme prazo legal aplicável |

## 4. Com quem compartilhamos

- **Corretoras destinatárias do lead** — recebem nome, telefone, e-mail, cidade, mensagem e dados qualificadores (volume, tipo, córrego). A corretora vira controladora desses dados após receber.
- **Mercado Pago / Asaas** — processadores de pagamento. Recebem dados mínimos para cobrança (nome, e-mail, valor).
- **ClickSign** — assinatura digital de contratos (Mercado do Café). Recebe nome, e-mail e CPF.
- **Open-Meteo, INMET, Yahoo Finance, CEPEA** — provedores de cotação/clima. **Não recebem nenhum dado pessoal**; só endereçamos cidades cadastradas.
- **Provedor de e-mail (SMTP)** — envia e-mails transacionais. Recebe nome e e-mail.
- **Provedor WhatsApp Business API (Meta)** — envia notificações ao motorista/cliente quando habilitado. Recebe número de telefone e nome.
- **Sentry** — observabilidade de erros. Recebe IP e contexto técnico — dados pessoais são **scrubbed** (CPF, senha, token, cookie removidos antes do envio).
- **BigDataCorp** (futuro, opt-in via env) — verificação automática de CNPJ. Recebe CNPJ.

A Kavita **não vende, aluga ou comercializa** dados pessoais a terceiros para fins publicitários.

## 5. Por quanto tempo guardamos

A Kavita aplica a retenção da tabela na seção 3. Após o prazo, os dados são **anonimizados ou apagados em massa**, exceto quando a lei exige preservação maior (ex.: notas fiscais — 5 anos pelo CTN).

## 6. Seus direitos (LGPD art. 18)

Você pode, gratuitamente e a qualquer momento:

- **Confirmar** se a Kavita trata seus dados.
- **Acessar** os dados que mantemos sobre você (exportação JSON disponível em `/meus-dados` para cliente da loja e produtor).
- **Corrigir** dados incompletos ou desatualizados.
- **Solicitar exclusão** dos dados (concedido em até 30 dias, salvo retenção legal).
- **Revogar consentimento** específico (ex.: marketing).
- **Solicitar portabilidade** dos seus dados a outro serviço.
- **Saber com quem** compartilhamos seus dados.

Para exercer qualquer direito, escreva para **dpo@kavita.com.br**. Resposta em até 15 dias úteis.

## 7. Segurança

A Kavita aplica medidas técnicas e organizacionais:

- Criptografia em trânsito (TLS 1.2+) em todas as rotas.
- Senha com hash bcrypt (salt + 10 rounds).
- CPF cifrado em repouso (AES-256).
- 2FA obrigatório para administradores.
- Cookies HttpOnly + SameSite e CSRF double-submit.
- Logs de auditoria com IP e versão dos termos aceitos.
- Boot endurecido em produção (rejeita configuração de demo).
- Controle de acesso granular (RBAC) por capability.

## 8. Cookies

A Kavita usa cookies estritamente necessários (autenticação e CSRF). Não usa cookies de marketing/tracking de terceiros sem consentimento.

## 9. Crianças e adolescentes

A plataforma não é destinada a menores de 18 anos. Se identificarmos cadastro de menor sem autorização parental, a conta é encerrada e os dados apagados.

## 10. Incidente de segurança

Em caso de incidente que possa causar risco ou dano relevante ao titular, a Kavita:

- **Comunica o titular** afetado em até 72 horas.
- **Comunica a ANPD** quando exigido pela Lei 13.709, art. 48.
- Publica **postmortem** em `kavita-backend/docs/compliance/incidents/` quando aplicável.

## 11. Transferência internacional

Os dados são processados em servidores localizados no **Brasil** (Railway/AWS São Paulo). Quando algum operador opera internacionalmente (Sentry/Cloudflare), a transferência segue salvaguardas previstas na LGPD art. 33.

## 12. Mudanças desta Política

Esta Política pode ser atualizada. Mudanças materiais são comunicadas com 15 dias de antecedência por e-mail e banner na plataforma. A versão vigente sempre estará em `/privacidade`. Consulte sempre antes de fornecer dados novos.

## 13. Contato do DPO

**E-mail:** dpo@kavita.com.br
**Sede operacional:** Manhuaçu, Minas Gerais
**Encarregado(a) de Dados:** comunicação institucional via dpo@kavita.com.br
até a designação formal do(a) Encarregado(a), que será publicada nesta
página antes do início da operação comercial definitiva.

---

> **Versão 1.0.0** — texto inicial em fase de validação controlada
> (staging). Os dados institucionais completos (razão social, CNPJ,
> endereço fiscal, identificação formal do(a) DPO) serão atualizados nos
> itens 1 e 13 antes da operação comercial definitiva, com nova versão
> semver e comunicação prévia aos titulares conforme item 12.
> Sincronizar com `kavita-backend/docs/compliance/` quando atualizar.
