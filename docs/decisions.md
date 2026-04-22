# Decisões Arquiteturais

Registro das decisões de design que estão no código mas não estavam documentadas em lugar nenhum. O objetivo é que um desenvolvedor que entra no projeto meses depois entenda o raciocínio por trás dessas escolhas — e saiba o que não mudar sem pensar.

Formato: ADR leve. Cada entrada tem contexto, decisão, consequências e o que não deve ser feito.

---

## Índice

- [ADR-001 — MySQL2 raw pool em vez de Sequelize ORM](#adr-001--mysql2-raw-pool-em-vez-de-sequelize-orm)
- [ADR-002 — Sequelize permanece no projeto apenas para migrations via CLI](#adr-002--sequelize-permanece-no-projeto-apenas-para-migrations-via-cli)
- [ADR-003 — CSRF com double-submit cookie](#adr-003--csrf-com-double-submit-cookie)
- [ADR-004 — tokenVersion para revogação de sessão com JWT stateless](#adr-004--tokenversion-para-revogação-de-sessão-com-jwt-stateless)
- [ADR-005 — Dois contextos de autenticação separados: admin e usuário (estendido para 4 em 2026-04-22)](#adr-005--dois-contextos-de-autenticação-separados-admin-e-usuário)
- [ADR-006 — Upload e mídia centralizados em mediaService](#adr-006--upload-e-mídia-centralizados-em-mediaservice)
- [ADR-007 — Migração para arquitetura em camadas: route → controller → service → repository](#adr-007--migração-para-arquitetura-em-camadas-route--controller--service--repository)

---

## ADR-001 — MySQL2 raw pool em vez de Sequelize ORM

**Status:** Ativo

### Contexto

O projeto começou com queries SQL manuais usando `mysql2`. Ao longo do tempo avaliamos se deveríamos migrar para Sequelize com models ORM completos, que é o caminho mais comum em projetos Node.js/Express.

O Sequelize tem vantagens evidentes: abstração de queries, migrations integradas, relacionamentos declarativos, hooks de lifecycle. Mas tem um custo que ficou claro durante o desenvolvimento: o ORM gera queries que você não controla, os relacionamentos ficam implícitos nos models, e o comportamento em casos de borda (transações, queries complexas com JOIN, subqueries, operações em lote) exige fugir do ORM e escrever SQL na mão mesmo assim.

Para este projeto — e-commerce com queries de pedido, carrinho, cupom, frete e estoque que frequentemente envolvem múltiplas tabelas e lógica condicional — o custo do ORM supera o benefício.

### Decisão

O código de aplicação usa **exclusivamente `mysql2` raw pool** (`config/pool.js`). Todas as queries são escritas em SQL explícito dentro de repositories (`repositories/*.js`). Nenhum model Sequelize é instanciado fora do contexto de CLI.

A camada de acesso a dados (`repositories/`) encapsula o pool e expõe funções nomeadas. Rotas, controllers e services nunca importam o pool diretamente — usam o repository do domínio.

### Consequências

**Positivas:**
- Queries são legíveis, debugáveis e previsíveis. O SQL que está no código é o SQL que roda no banco.
- Sem "magic" de ORM: joins, transações e locks são explícitos.
- Performance: nenhuma query gerada implicitamente; nenhum `SELECT *` acidental.
- Testes de repository são diretos: mockar o pool é suficiente.

**Negativas:**
- Mais SQL para escrever. Sem abstração de CRUD simples.
- Mudanças de schema exigem alterar SQL em múltiplos repositories (não há um único model para atualizar).
- Sem migrations automáticas a partir de models (ver ADR-002).

### O que não deve ser feito

- Não importe `pool` diretamente em controllers, services ou arquivos de rota. O pool é dependência do repository, não das camadas acima.
- Não crie models Sequelize no código de aplicação. Isso criaria dois sistemas de acesso a dados paralelos e quebraria a previsibilidade do projeto.
- Não use `pool.query()` inline dentro de uma rota. Use o repository do domínio correspondente.

---

## ADR-002 — Sequelize permanece no projeto apenas para migrations via CLI

**Status:** Ativo

### Contexto

Depois de decidir usar MySQL2 raw pool (ADR-001), ainda precisamos de uma forma estruturada de gerenciar migrations de schema. Opções avaliadas:
- Migrations manuais com scripts SQL versionados
- `db-migrate` (biblioteca de migrations sem ORM)
- Sequelize CLI (que funciona independentemente dos models ORM)

Sequelize CLI já estava parcialmente configurado no projeto e tem boa DX para migrations: versionamento automático, rollback, ambiente por variável `NODE_ENV`, tracking em tabela `SequelizeMeta`.

### Decisão

O `sequelize` e `sequelize-cli` permanecem como dependências, mas são usados **exclusivamente para migrations via CLI**. O `.sequelizerc` na raiz configura os caminhos. Os arquivos em `migrations/` são scripts de migração de schema.

Nenhum model Sequelize existe no código de aplicação. A presença de `sequelize` no `package.json` não significa que há ORM em uso — é infraestrutura de CLI.

### Consequências

- Migrations versionadas com rollback (`npm run db:undo`).
- Status de migrations visível (`npm run db:status`).
- Nenhum benefício de ORM no runtime da aplicação.
- Developers que não leram esta documentação podem passar tempo procurando models Sequelize que não existem.

### O que não deve ser feito

- Não crie `models/` com definições Sequelize para usar no código de aplicação. Isso misturaria dois sistemas de acesso a dados.
- Não use `sequelize.query()` ou instâncias de Model fora de scripts de migration.
- Não remova `sequelize` e `sequelize-cli` do `package.json` sem ter outro sistema de migration configurado e todas as migrations históricas migradas para o novo formato.

---

## ADR-003 — CSRF com double-submit cookie

**Status:** Ativo
**Código:** `middleware/csrfProtection.js`

### Contexto

O projeto usa JWT em cookie HttpOnly para autenticação. Cookies HttpOnly são imunes a XSS (JS malicioso não consegue ler o cookie), mas são vulneráveis a CSRF: qualquer site pode disparar uma requisição para a API e o browser vai enviar o cookie automaticamente.

Para mitigar CSRF existem algumas abordagens:
- **SameSite=Strict:** impede envio de cookie cross-origin. Simples, mas quebra fluxos legítimos onde o usuário vem de um redirect externo (ex: retorno de gateway de pagamento) e perde a sessão.
- **Origin/Referer check:** checar o header Origin na API. Frágil — pode ser ausente em alguns contextos de browser.
- **Double-submit cookie:** gerar um token aleatório, enviá-lo também como cookie legível por JS (`httpOnly: false`), e exigir que o frontend leia e reenvie no header. Um atacante cross-origin não consegue ler o cookie, logo não consegue reproduzir o header.

O `SameSite=Strict` foi descartado por quebrar o fluxo de retorno do Mercado Pago. Double-submit cookie foi escolhido por ser simples de implementar, sem estado no servidor, e compatível com SPAs.

### Decisão

CSRF é protegido com **double-submit cookie**:

1. Frontend faz `GET /api/csrf-token` antes de qualquer mutação.
2. A API gera um token de 32 bytes (`crypto.randomBytes`), define o cookie `csrf_token` com `httpOnly: false` (JS pode ler) e retorna o token no body.
3. Frontend armazena o token e envia em toda requisição mutante no header `x-csrf-token`.
4. `validateCSRF` compara cookie com header usando `crypto.timingSafeEqual()` (resistente a timing attacks). Divergência → 403.
5. GET/HEAD/OPTIONS são isentos (métodos seguros pelo RFC 7231).

O token expira em 2 horas (`COOKIE_MAX_AGE_MS`), alinhado com a sessão admin.

### Consequências

- Sem estado no servidor para CSRF (sem Redis, sem banco).
- Funciona com qualquer frontend SPA que consiga ler cookies e setar headers.
- Exige que o frontend faça `GET /api/csrf-token` no início da sessão e retenha o token.
- Se o cookie `csrf_token` expirar antes do `adminToken`, as mutações começarão a falhar com 403. O frontend precisa renovar o token CSRF periodicamente ou ao receber 403.

### O que não deve ser feito

- Não mude o cookie `csrf_token` para `httpOnly: true`. Se o JS não puder ler o cookie, o double-submit não funciona — o frontend não conseguiria enviar o token no header.
- Não use `===` para comparar os tokens. Use sempre `crypto.timingSafeEqual()`. Comparação de string convencional é vulnerável a timing attacks.
- Não remova `validateCSRF` das rotas de mutação sem substituir por outra proteção CSRF equivalente.
- Não adicione CSRF em rotas GET. Métodos seguros não precisam de proteção e adicionar CSRF neles cria bloqueios em cenários de requisição normal (ex: prefetch, bots de indexação legítimos).

---

## ADR-004 — tokenVersion para revogação de sessão com JWT stateless

**Status:** Ativo
**Código:** `middleware/verifyAdmin.js`, `middleware/authenticateToken.js`

### Contexto

JWT por design é stateless: uma vez emitido, é válido até expirar. Isso cria um problema de segurança: se um admin faz logout, o token ainda é válido no período restante. Se um token for comprometido (ex: vazamento de log), ele continua válido até expirar.

As opções são:
- **Manter o problema:** logout "visual" no frontend, token ainda válido no backend. Inaceitável para o contexto admin.
- **Token blacklist em Redis:** após logout, adicionar o token em uma lista de bloqueados. Funciona, mas exige Redis disponível e aumenta a complexidade de cada request (uma query Redis extra).
- **tokenVersion no banco:** guardar um número inteiro `tokenVersion` no registro do usuário/admin. Incluir o valor atual no JWT no momento do login. A cada request, comparar o valor no JWT com o valor no banco. No logout, incrementar o `tokenVersion` no banco — todos os tokens com a versão antiga tornam-se inválidos imediatamente.

A abordagem blacklist com Redis foi descartada porque tornaria o sistema inoperante se Redis estivesse indisponível (ou exigiria lógica de fallback complexa). `tokenVersion` resolve o problema sem dependência de Redis — o banco já é a fonte de verdade.

### Decisão

Cada registro de admin e usuário tem uma coluna `tokenVersion INTEGER DEFAULT 0`. No login, o valor atual é embutido no JWT (`{ id, tokenVersion, ... }`). Em cada request autenticado, o middleware compara o valor do JWT com o valor atual no banco. Se diferirem, a sessão é rejeitada com 401.

No logout, `tokenVersion` é incrementado no banco. Todos os JWTs emitidos antes do logout ficam inválidos automaticamente.

`null` no banco é tratado como `0` para compatibilidade com registros criados antes da migration que adicionou a coluna.

### Consequências

- Logout real: token invalidado no servidor imediatamente, sem esperar expiração.
- Se um token for comprometido, incrementar `tokenVersion` manualmente no banco invalida o token.
- Cada request autenticado faz uma query no banco para buscar o admin/usuário e comparar `tokenVersion`. Para admin, o resultado é cacheado no Redis por 60s para reduzir a carga.
- A migration que adiciona `tokenVersion` nas tabelas é pré-requisito para o logout funcionar. Sem ela, a coluna não existe e a comparação falha silenciosamente (ver tratamento de `null` acima).

### O que não deve ser feito

- Não remova a verificação de `tokenVersion` do middleware para "simplificar". Isso desativa o logout real e torna compromisso de token irrecuperável sem reiniciar o servidor.
- Não confie apenas na expiração do JWT como mecanismo de logout. JWT expirado !== usuário deslogado do servidor.
- Não coloque permissões dentro do JWT. As permissões de admin são carregadas do banco (ou cache Redis) em cada request, propositalmente — ver comentário em `verifyAdmin.js`: `"Permissões SEMPRE vêm do banco (ou cache Redis) — nunca do JWT"`. Isso garante que remoção de permissão tem efeito imediato, sem necessidade de forçar novo login.

---

## ADR-005 — Dois contextos de autenticação separados: admin e usuário

**Status:** Ativo — **estendido em 2026-04-22** para quatro contextos (admin, usuário, corretora, produtor)
**Código:** `middleware/verifyAdmin.js`, `middleware/authenticateToken.js`, `middleware/verifyCorretora.js`, `middleware/verifyProducer.js`

> **Nota de atualização (2026-04-22):** O princípio de isolamento descrito neste ADR continua válido. Hoje o sistema tem **quatro** contextos isolados (não dois): admin, usuário da loja, corretora e produtor (magic-link). Cada um tem cookie HttpOnly próprio e middleware dedicado. Para a visão atual consolidada, ver `BACKEND_SECURITY_ALIGNMENT.md` seção "Autenticação — quatro contextos isolados".

### Contexto

O sistema tem dois tipos de usuário com superfícies de ataque completamente diferentes:
- **Usuário final:** acessa carrinho, checkout, pedidos, perfil. Sessão longa (7 dias). Baixo risco de ação destrutiva.
- **Admin:** acessa painel de gestão com operações sensíveis (pedidos, configurações, usuários, cupons, estoque). Sessão curta (2 horas). Risco alto.

Usar um único sistema de autenticação para os dois contextos criaria acoplamento desnecessário: qualquer mudança na lógica de um (ex: adicionar MFA para admin, mudar TTL de sessão) afetaria o outro. Além disso, um vazamento de token de usuário não poderia afetar o painel admin, e vice-versa.

### Decisão

Dois cookies HttpOnly completamente separados:

| Cookie | Contexto | TTL | Middleware |
|---|---|---|---|
| `auth_token` | Usuário final | 7 dias | `authenticateToken` |
| `adminToken` | Admin | 2 horas | `verifyAdmin` |

Os dois middlewares são independentes. `verifyAdmin` popula `req.admin`. `authenticateToken` popula `req.user`. Nenhuma rota usa os dois ao mesmo tempo.

A lógica de permissão granular (RBAC via `requirePermission`) existe apenas no contexto admin. O contexto de usuário tem autorização simples (autenticado ou não).

### Consequências

- Comprometimento de um token de usuário não dá acesso ao painel admin, e vice-versa.
- TTLs diferentes por risco: sessão admin expira em 2h, forçando reautenticação frequente.
- Os dois fluxos de login são endpoints distintos (`POST /api/login` vs `POST /api/admin/login`) e podem evoluir independentemente.
- Dois cookies na resposta HTTP. O browser lida com isso sem problema.

### O que não deve ser feito

- Não use `verifyAdmin` em rotas de usuário nem `authenticateToken` em rotas admin. Os dois middlewares verificam cookies diferentes — usar o errado vai gerar 401 para o usuário legítimo.
- Não unifique os dois sistemas de auth em um único middleware "genérico". O isolamento é intencional e protege o painel admin de vulnerabilidades no fluxo de usuário.
- Não aumente o TTL do `adminToken` para "melhorar a experiência do admin". A sessão curta é uma escolha de segurança deliberada para acesso a área sensível.

---

## ADR-006 — Upload e mídia centralizados em mediaService

**Status:** Ativo
**Código:** `services/mediaService.js`

### Contexto

No início do projeto, cada módulo que precisava de upload implementou o próprio: configuração de multer inline na rota, lógica de mover arquivos para a pasta certa, nomes de arquivo diferentes por módulo. Resultado: lógica duplicada, nomes inconsistentes, sem tratamento de cleanup em caso de erro, sem suporte a trocar de storage (local → S3) sem mexer em múltiplos arquivos.

Quando chegou o requisito de suportar S3 e GCS além do disco local, ficou claro que a duplicação tornava a mudança inviável sem refatoração massiva.

### Decisão

Todo upload passa obrigatoriamente por `services/mediaService.js`. O serviço é a única camada que conhece multer, o storage driver e os caminhos físicos de arquivo.

O fluxo obrigatório:
1. `mediaService.upload` como middleware multer na definição da rota (salva temporariamente)
2. `mediaService.persistMedia(req.files, { folder })` no controller/service (move para pasta permanente, retorna paths)
3. O path retornado (`/uploads/{folder}/{arquivo}`) é o que vai para o banco
4. Em caso de erro antes de salvar no banco: `mediaService.enqueueOrphanCleanup(targets)`
5. Em DELETE: `mediaService.removeMedia(targets)`

O storage driver é controlado por `MEDIA_STORAGE_DRIVER` (env var): `disk` (padrão), `s3`, `gcs`. Trocar de driver não exige mudança de código nos modules que usam `mediaService`.

### Consequências

- Um único lugar para mudar se o storage trocar (disco → S3).
- Nomenclatura consistente de arquivos (UUID + timestamp, sem colisões).
- Cleanup de arquivos órfãos em caso de erro é tratado de forma uniforme.
- Todos os módulos dependem de `mediaService` — é uma dependência central. Bugs nele afetam todo upload do sistema.
- A pasta de destino (`folder`) é responsabilidade de quem chama `persistMedia`. Manter a lista de pastas em uso documentada (ver README) evita criação de pastas aleatórias.

### O que não deve ser feito

- Não use `fs.writeFile`, `fs.copyFile` ou `fs.rename` diretamente em rotas ou controllers para salvar arquivos. Isso contorna o `mediaService` e quebra o suporte a storage drivers alternativos.
- Não configure multer (`diskStorage`, `memoryStorage`) fora do `mediaService`. Todo upload deve passar pelo middleware `mediaService.upload`.
- Não use `mediaService.cleanupMedia` — essa função não existe. As funções corretas são `removeMedia` (deleção imediata) e `enqueueOrphanCleanup` (deleção assíncrona em caso de erro de transação).
- Não salve o path absoluto do arquivo no banco. Salve apenas o path público relativo (`/uploads/{folder}/{arquivo}`). O path absoluto é específico do ambiente e quebra em produção com storage diferente.

---

## ADR-007 — Migração para arquitetura em camadas: route → controller → service → repository

**Status:** Em andamento

### Contexto

O projeto começou com toda a lógica no arquivo de rota: query SQL, validação de entrada, regra de negócio e resposta HTTP em um único lugar. Isso funcionou enquanto os módulos eram pequenos. Com o tempo, arquivos como `adminProdutos.js` (659 linhas), `adminConfig.js` (647 linhas) e `publicServicos.js` (651 linhas) acumularam SQL inline, validações manuais com `if (!campo)` e `res.json()` cru, tornando qualquer manutenção arriscada.

Os problemas concretos que motivaram a migração:
- Impossível testar regra de negócio sem subir a rota inteira.
- Qualquer mudança em uma parte da rota pode silenciosamente afetar outra.
- SQL duplicado entre módulos sem forma de centralizar.
- Sem contrato de resposta: cada rota retornava um shape diferente de JSON.
- Sem tratamento de erro padronizado: cada rota tinha seu próprio `res.status(500).json(...)`.

### Decisão

Adotar arquitetura em camadas com responsabilidades bem definidas:

- **Rota** (`routes/`): monta middleware de validação e delega para controller. Sem lógica.
- **Controller** (`controllers/`): extrai dados do `req`, chama service, retorna via `lib/response.js`. Sem SQL, sem regra de negócio.
- **Service** (`services/`): regras de negócio, orquestração. Sem `req`/`res`.
- **Repository** (`repositories/`): queries MySQL2. Sem lógica de negócio.

A migração é **progressiva**: ao tocar um módulo legado por qualquer motivo (bug fix, nova feature), ele deve ser migrado para o padrão moderno. Não existe uma sprint dedicada só para refatoração — a migração acontece junto com o trabalho normal.

O padrão canônico de referência está em `routes/admin/adminDrones.js` + `controllers/drones/` + `services/drones/` + `repositories/dronesRepository.js`.

### Consequências

- Módulos modernos e legados coexistem em produção. Isso é intencional e temporário.
- Um developer que entra no projeto vai encontrar dois padrões opostos. Precisará ler esta documentação para entender qual seguir.
- A cobertura de testes aumenta à medida que os módulos são migrados (services e repositories são mais fáceis de testar em isolamento do que rotas monolíticas).
- O progresso da migração é rastreado na tabela de módulos legados no README.

### O que não deve ser feito

- Não use arquivos da tabela de módulos legados como referência de implementação. Use os módulos modernos.
- Não crie arquivos novos no padrão legado (SQL inline na rota, `if (!campo)`, `res.json()` cru). Todo arquivo novo deve seguir o padrão moderno, independentemente do módulo ao lado ser legado.
- Não faça migrações de refatoração sem cobertura de teste. Migrar `adminConfig.js` (647 linhas) sem testes é trocar um problema por outro.
- Não amplie módulos legados adicionando novas rotas no mesmo arquivo. Se precisar adicionar uma rota em um módulo legado, migre o arquivo primeiro ou crie um novo arquivo moderno e mova para ele.
