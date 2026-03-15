# BACKEND_SECURITY_ALIGNMENT.md
Auditoria de segurança e refatoração — Kavita Backend
Data: 2026-03-15

---

## 1. MUDANÇAS APLICADAS

### FASE 2 — Upload Seguro (`services/mediaService.js`)

**Problema corrigido:** O `imageFilter` aceitava `image/*` — um atacante podia enviar `image/svg+xml` (SVG pode conter JavaScript) ou qualquer outro MIME forjado. Também não havia limite de tamanho no multer (o `express.json limit: 5mb` só se aplica a JSON, não a `multipart/form-data`).

**Patch aplicado:**
- Substituído `mime.startsWith("image/")` por whitelist explícita: `ALLOWED_IMAGE_MIMES = { image/jpeg, image/png, image/webp, image/gif }`
- SVG bloqueado explicitamente (principal vetor de XSS em uploads de imagem)
- Adicionado `limits: { fileSize: 5 * 1024 * 1024, files: 10 }` no multer
- Vídeos: apenas `video/mp4`, `video/webm`, `video/ogg` (campos `heroVideo` e `media`)

**Impacto no frontend:** Nenhum — desde que o frontend envie apenas JPEG/PNG/WEBP/GIF (comportamento esperado). Se houver uploads de SVG ou outros formatos não listados, o servidor retornará 400 com mensagem clara.

**Infra adicional disponível mas não ativada centralmente:** `utils/fileValidation.js` já tem `validateFileMagicBytes()` para validação pós-upload. As rotas `adminServicos.js` e `adminConfigUploadRoutes.js` já chamam essa função. Recomenda-se aplicar em TODOS os módulos que recebem upload — ver lista de pendências.

---

### FASE 4 — Sanitização XSS (`utils/sanitize.js` — novo arquivo)

**Problema corrigido:** Nenhuma biblioteca de sanitização HTML estava instalada. Campos como `comentario` em avaliações, `content`/`title`/`excerpt` em notícias, e campos de perfil de usuário eram salvos no banco sem remoção de tags HTML, possibilitando XSS persistido.

**Patch aplicado:**
- Criado `utils/sanitize.js` com:
  - `stripHtml(str)`: remove todas as tags HTML (texto puro)
  - `escapeHtml(str)`: escapa entidades HTML para exibição segura
  - `sanitizeRichText(str)`: remove apenas vetores perigosos (`<script>`, `<iframe>`, `on*`, `javascript:`, `data:`, `vbscript:`) mantendo formatação básica
  - `sanitizeText(str, maxLen)`: combina stripHtml + truncagem

**Arquivos modificados:**
- `routes/publicAvaliacaoColaborador.js` — `comentario` agora passa por `sanitizeText(str, 1000)`
- `controllers/news/adminPostsController.js` — `title`, `excerpt`, `category`, `tags` passam por `sanitizeText`; `content` passa por `sanitizeRichText`
- `routes/userProfile.js` — campos de perfil (nome, endereço, etc.) passam por `sanitizeText`

**Impacto no frontend:** Campos que enviavam HTML serão retornados sem as tags (se forem texto puro) ou sem os vetores de execução (se forem rich text). Considere que:
- Se o editor de notícias do frontend envia HTML legítimo (ex: `<strong>`, `<p>`, `<a>`), o `sanitizeRichText` preserva essas tags — apenas remove scripts/eventos
- Se o título ou excerpt enviava HTML, o texto retornado será plain text sem tags

**Nota sobre produção:** Para rich text em produção, instale `sanitize-html`:
```bash
npm install sanitize-html
```
E substitua `sanitizeRichText` por:
```javascript
const sanitizeHtml = require("sanitize-html");
sanitizeHtml(str, { allowedTags: sanitizeHtml.defaults.allowedTags, allowedAttributes: sanitizeHtml.defaults.allowedAttributes })
```

---

### FASE 3 — Validação de Schema (`validators/authValidator.js`, `routes/authRoutes.js`)

**Problema corrigido:** Os endpoints `/api/forgot-password` e `/api/reset-password` tinham rate limiting mas nenhum schema validation — qualquer payload malformado chegava ao controller sem verificação prévia.

**Patch aplicado:**
- Adicionado `forgotPasswordValidators`: valida `email` (formato + tamanho máx 254)
- Adicionado `resetPasswordValidators`: valida `token` (string, 10–512 chars) e `novaSenha` (mín 8, máx 128 chars)
- Aplicados nas rotas respectivas em `authRoutes.js`

**Impacto no frontend:**
- `/api/forgot-password` com email inválido agora retorna `400 { code: "VALIDATION_ERROR", message: "Dados inválidos.", errors: [...] }`
- `/api/reset-password` com `novaSenha` < 8 chars retorna 400 com detalhe do campo
- O frontend deve exibir as mensagens de erro de validação se ainda não o faz

---

### FASE 3 — Validação de valores em userProfile (`routes/userProfile.js`)

**Problema corrigido:** O loop dinâmico de UPDATE não validava o comprimento ou conteúdo dos valores, apenas a whitelist do nome da coluna. Um usuário podia enviar strings de tamanho arbitrário ou com conteúdo HTML em campos como `nome` e `endereco`.

**Patch aplicado:**
- Adicionado `FIELD_MAX_LENGTH` com limites por campo
- Cada valor é validado contra o comprimento máximo antes do INSERT
- Cada valor passa por `sanitizeText()` antes de ser persistido
- Retorna 400 com mensagem específica se campo exceder o limite

**Impacto no frontend:** Se o frontend já valida comprimentos no lado cliente, sem impacto. Se houver algum campo sendo enviado com HTML (ex: endereço com `<br>`), o HTML será removido antes do salvamento.

---

### FASE 5 — Permissões Admin (`middleware/requirePermission.js`, `routes/index.js`)

**Problema corrigido:** O middleware `requirePermission` não tinha bypass para o role `master`. Se a tabela `admin_role_permissions` não tivesse registros para todas as permissões do master, ele seria bloqueado mesmo sendo superusuário.

**Patch aplicado em `requirePermission.js`:**
- Adicionado bypass automático para `SUPERUSER_ROLES = ["master"]`
- Admin com role `master` passa sem verificação de permissão individual
- Outros roles continuam verificando `req.admin?.permissions`

**Patch aplicado em `routes/index.js`:**
- `/admin/relatorios` — requer `requirePermission("relatorios.ver")`
- `/admin/config` — requer `requirePermission("config.editar")`
- `/admin/shop-config/upload` — requer `requirePermission("config.editar")`
- `/admin/users` — requer `requirePermission("usuarios.ver")`
- `/admin/pedidos` — requer `requirePermission("pedidos.ver")`

**Impacto no frontend:** Admins sem as permissões acima receberão `403 Permissão insuficiente`. O frontend deve tratar 403 em áreas admin exibindo mensagem adequada. Masters não são afetados.

**Pendência:** As permissões `relatorios.ver`, `config.editar`, `usuarios.ver`, `pedidos.ver` precisam ser **semeadas no banco de dados** nos roles apropriados. Veja seção "Pendências" abaixo.

---

## 2. ARQUIVOS ALTERADOS

| Arquivo | Tipo de mudança |
|---------|----------------|
| `services/mediaService.js` | Upload: whitelist MIME explícita + limites de tamanho |
| `utils/sanitize.js` *(novo)* | Utilitários de sanitização HTML |
| `routes/publicAvaliacaoColaborador.js` | Sanitização de `comentario` + validação de tipos |
| `controllers/news/adminPostsController.js` | Sanitização de campos de texto e rich text |
| `routes/userProfile.js` | Sanitização + validação de comprimento de campos |
| `validators/authValidator.js` | Adicionados validators para forgot/reset password |
| `routes/authRoutes.js` | Aplicação dos validators nas rotas auth |
| `middleware/requirePermission.js` | Bypass para role master |
| `routes/index.js` | requirePermission em rotas sensíveis |
| `BACKEND_SECURITY_ALIGNMENT.md` *(novo)* | Este documento |

---

## 3. ENDPOINTS AFETADOS

### Mudanças de comportamento visíveis ao cliente

| Endpoint | Mudança | Status anterior | Status novo |
|----------|---------|----------------|-------------|
| `POST /api/uploads/*` (qualquer) | SVG e tipos não listados rejeitados | 200 (aceito) | 400 com mensagem |
| `POST /api/public/servicos/avaliacoes` | HTML removido de `comentario`; `nota` validado como inteiro | 201/400 | 201/400 (mesmo status, dados sanitizados) |
| `POST /api/forgot-password` | Email validado por formato e tamanho | 200/500 | 200/400/500 |
| `POST /api/reset-password` | Token e novaSenha validados | 200/400 | 200/400 (mais granular) |
| `PUT /api/users/me` | Campos sanitizados; comprimento validado | 200/400 | 200/400 |
| `PUT /api/users/admin/:id` | Idem | 200/400 | 200/400 |
| `GET/POST/PUT/DELETE /api/admin/relatorios` | Requer permissão `relatorios.ver` | 200/403 | 200/403 |
| `GET/POST/PUT/DELETE /api/admin/config` | Requer permissão `config.editar` | 200/403 | 200/403 |
| `GET/POST/PUT/DELETE /api/admin/shop-config/upload` | Requer permissão `config.editar` | 200/403 | 200/403 |
| `GET/POST/PUT/DELETE /api/admin/users` | Requer permissão `usuarios.ver` | 200/403 | 200/403 |
| `GET/POST/PUT/DELETE /api/admin/pedidos` | Requer permissão `pedidos.ver` | 200/403 | 200/403 |
| `POST/PUT /api/admin/news/*` | Conteúdo sanitizado antes de salvar | 201/200 | 201/200 (dados sanitizados) |

---

## 4. O QUE JÁ ESTAVA CORRETO (não alterado)

- **Rate limiting**: já aplicado globalmente e com limiters específicos para login, admin login, MFA, forgot-password, reset-password, logout e comentários de drones
- **Error handler**: `middleware/errorHandler.js` já não vaza stack trace em produção
- **CSRF**: double-submit cookie corretamente implementado e aplicado
- **JWT HttpOnly cookies**: contextos admin e usuário separados corretamente
- **Middleware order** em `server.js`: CORP override correto (Helmet → CORP override → express.static)
- **Magic bytes validation**: `utils/fileValidation.js` implementado; já usado em adminServicos.js e adminConfigUploadRoutes.js
- **tokenVersion**: logout com revogação de sessão já implementado
- **CORS**: restrito a origens permitidas

---

## 5. PENDÊNCIAS

### 5A. Dependem do backend (você pode fazer)

- [ ] **Semear permissões no banco**: adicionar as seguintes permissões para os roles que devem ter acesso a relatórios, config, usuários e pedidos:
  ```sql
  INSERT INTO admin_permissions (chave) VALUES
    ('relatorios.ver'),
    ('config.editar'),
    ('usuarios.ver'),
    ('pedidos.ver');
  -- Em seguida, vincular ao role apropriado via admin_role_permissions
  ```
- [ ] **Expandir magic bytes validation** para todos os módulos com upload (atualmente só adminServicos e adminConfigUploadRoutes usam). Aplicar `validateFileMagicBytes()` em: adminDrones, adminSiteHero, adminProdutos, adminColaboradores, adminNewsRoutes
- [ ] **Instalar sanitize-html** para sanitização robusta de rich text em produção:
  ```bash
  npm install sanitize-html
  ```
  Substituir `sanitizeRichText` em `utils/sanitize.js` pela versão do pacote
- [ ] **Expandir requirePermission** para os demais módulos admin (categorias, drones, news, cupons, etc.) após semear permissões no banco
- [ ] **Validar tamanho em avaliações GET**: o endpoint `GET /:id/avaliacoes` usa o `id` do params diretamente no SQL — validar que é um inteiro positivo

### 5B. Dependem do frontend

- [ ] Tratar resposta `400` de upload com a mensagem de erro do servidor (atualmente pode estar ignorando o corpo do 400 em alguns uploads)
- [ ] Tratar `400` com `errors[]` em forgot-password e reset-password (exibir por campo)
- [ ] Tratar `403 Permissão insuficiente` em áreas admin sensíveis (relatorios, config, users, pedidos) para admins não-master
- [ ] Se o editor de notícias envia HTML no campo `content`, confirmar que o rich text resultante após sanitização está compatível (tags básicas preservadas, scripts removidos)
- [ ] Verificar se alguma tela envia campos de texto com HTML intencional (ex: endereço com formatação) — agora serão stripped

### 5C. Dependem de decisão de produto

- [ ] **GIF**: Manter ou bloquear GIF em uploads? GIF animados podem ser usados para exploits de descompressão em alguns contextos. Decisão: manter na whitelist por ora mas monitorar.
- [ ] **Audit log expandido**: o sistema de `admin_logs` existe mas nem todos os endpoints chamam `logAdmin()`. Decisão: quais ações devem gerar log auditável?
- [ ] **Soft delete vs hard delete** em avaliações: atualmente qualquer pessoa pode submeter avaliação sem autenticação. Decisão: requer login?
- [ ] **Rich text vs Markdown**: se o news `content` for Markdown (não HTML), o `sanitizeRichText` deve ser substituído por um parser de Markdown seguro

---

## 6. CHECKLIST DE SEGURANÇA FINAL

### P0 — Concluído ✅
- [x] Upload: whitelist de MIME types explícita (SVG bloqueado)
- [x] Upload: limite de tamanho no multer (5MB/arquivo, máx 10 arquivos)
- [x] Sanitização XSS em comentários públicos (avaliacoes)
- [x] Sanitização XSS em rich text de notícias (content, title, excerpt)
- [x] Sanitização XSS em campos de perfil de usuário
- [x] Bypass master em requirePermission (segurança crítica para não travar superadmins)
- [x] Schema validation em forgot-password e reset-password

### P1 — Concluído ✅
- [x] requirePermission aplicado em relatorios, config, users, pedidos
- [x] Validação de comprimento nos campos de perfil de usuário
- [x] Error handler: não vaza stack trace em produção (já estava correto)

### P1 — Pendente ⏳
- [ ] Semear permissões no banco para novos requires
- [ ] Magic bytes validation em todos os módulos de upload
- [ ] Instalar sanitize-html para rich text robusto

### P2 — Pendente ⏳
- [ ] Audit log expandido para todos os módulos admin
- [ ] requirePermission expandido para categorias, drones, news, cupons
- [ ] Zod schema validation centralizado (já na package.json mas não usado)
