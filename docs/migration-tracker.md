# Migration Tracker — kavita-backend

> **Ultima atualizacao:** 2026-04-08

---

## Estado atual

**Migracao arquitetural concluida.** Todos os modulos do projeto seguem o padrao moderno:
rota magra -> controller -> service -> repository + Zod + `lib/response.js` + `AppError`.

- **Diretorios `_legacy/`:** removidos. Nao existem mais.
- **Arquivos com SQL inline na rota:** zero.
- **Modulos migrados:** 40+ modulos.

---

## Checklist de conformidade por modulo

Todos os modulos atendem aos criterios abaixo:

- [x] Repository com queries extraidas
- [x] Controller com handlers usando `response.ok/created/noContent/paginated`
- [x] Service (quando ha logica de negocio alem de CRUD)
- [x] Schema Zod para rotas com body (POST/PUT/PATCH)
- [x] Rota magra sem SQL inline
- [x] Erros via `next(new AppError(msg, ERROR_CODES.XXX, status))`
- [x] Respostas via `lib/response.js`
- [x] `module.exports = { fn1, fn2 }` no controller

---

## Desvios conhecidos (nao sao bloqueadores)

| Arquivo | Desvio | Severidade |
|---------|--------|------------|
| `routes/utils/uploadsCheck.js` | Handler inline com `res.json()` direto. Utilitario de infra, nao dominio. | Baixa |
| `routes/ecommerce/payment.js` | Mount hibrido: monta rotas admin dentro do contexto ecommerce. Controller correto. | Baixa |
| `routes/public/publicProdutos.js` | Wrapper deprecated que re-exporta `publicAvaliacoes.js`. Pode ser removido. | Baixa |

---

## Historico — ultimas migracoes

| Modulo | Concluido em | Observacoes |
|--------|-------------|-------------|
| `adminAdmins.js` | 2026-04 | Controller + repository + schemas Zod |
| `adminUsers.js` | 2026-04 | Controller + repository + schemas Zod |
| `adminPermissions.js` | 2026-04 | Controller + repository + schemas Zod |
| `adminLogs.js` | 2026-04 | Controller + repository |
| `adminStats.js` | 2026-04 | Controller + repository |
| `adminRelatorios.js` | 2026-04 | Controller + repository |
| `adminCupons.js` | 2026-04 | Controller + repository + schemas Zod |
| `adminMarketingPromocoes.js` | 2026-04 | Controller + repository + schemas Zod |
| `adminSolicitacoesServicos.js` | 2026-04 | Controller + repository + schemas Zod |
| `userProfile.js` | 2026-04 | Controller + service + repository + schemas Zod |
| `userAddresses.js` | 2026-04 | Controller + service + repository + schemas Zod |
| `pedidos.js` (ecommerce) | 2026-04 | Controller + repository |
| `publicShopConfig.js` | 2026-04 | Controller + repository |
| `adminShippingZones.js` | 2026-04-02 | Repository + service + controller + Zod |
| `adminComunicacao.js` | 2026-04-02 | Repository + service reescrito + controller + Zod |
| `favorites.js` | 2026-04-02 | Repository + service + controller + Zod |
| `adminEspecialidades.js` | 2026-04-02 | Repository + controller |
| `adminConfigUpload.js` | 2026-04-02 | Service + controller |
| `adminPedidos.js` | 2026-04-01 | Controller + schemas + lib/response.js |
| `publicProducts.js` | 2026-04-01 | Handlers extraidos para publicProductsController |
| `authRoutes.js` + `login.js` | 2026-04-01 | Migrado de express-validator para Zod |
| `userRegister.js` | 2026-04-01 | Zod, controller, sem express-validator |
| `publicCategorias.js` | 2026-04-01 | Repository + controller |
| `adminServicos.js` | 2026-04-01 | Repository + service + controller + Zod |
| `adminDrones.js` + `publicDrones.js` | 2025 | Referencia canonica com upload |
| `adminProdutos.js` | 2025 | Referencia com Zod + multipart |
| `checkout.js` | 2025 | Referencia com transacoes |
| `cart.js` | 2025 | Handlers extraidos |
| `adminCarts.js` | 2025 | Rota magra com controller |
| `adminConfig.js` | 2025 | Rota magra |
| `login.js` (user) | 2025 | Auth com cookie HttpOnly |
| `adminLogin.js` | 2025 | Auth admin com tokenVersion |
| `adminNews.js` | 2025 | Controller em subdiretorio |
| `adminSiteHero.js` | 2025 | Rota magra |
| `adminRoles.js` | 2025 | Moderno, sem SQL inline |
| `adminCategorias.js` | 2026 | Moderno |
| `adminColaboradores.js` | 2026 | Moderno |
| `publicServicos.js` | 2026-03 | Repository + service + controller |
| `publicPromocoes.js` | 2026-03 | Service + controller |
