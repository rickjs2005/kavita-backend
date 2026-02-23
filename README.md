
Documentação e contratos do backend Kavita
Resumo executivo
A análise do branch main do repositório kavita-backend mostra um backend Node.js/Express com roteamento centralizado sob o prefixo /api, CORS habilitado para credenciais (necessário para cookies) e Swagger UI servido em /docs com spec em /api-docs.json. 

O mecanismo de autenticação implementado é JWT armazenado em cookie HttpOnly: para usuário (auth_token, com maxAge de 7 dias) e para admin (adminToken, com maxAge de 2 horas). 

Ao mesmo tempo, o repositório (no estado atual do branch) apresenta lacunas importantes: arquivos críticos referenciados pelo bootstrap (por exemplo, rate limiter adaptativo, error handler global, AppError/ErrorCodes e middleware de autenticação authenticateToken) não foram encontrados no tree publicado via GitHub Raw, o que indica que o servidor não sobe “as-is” sem completar/ajustar esses módulos. Isso impacta diretamente a “realidade” operacional de várias rotas (mesmo quando a rota está escrita, ela pode não montar por dependência ausente). 

Além disso, há inconsistências entre código e schema SQL inicial disponível: por exemplo, o usuarios da migration 001 não possui senha/cpf, mas a rota /api/users/register tenta inserir esses campos. 

A seguir, entrego: (1) um README.md completo (pt-BR) alinhado ao código, (2) um openapi.yaml com paths mapeados e cookie auth, (3) um contracts_table.md em tabela com exemplos, e (4) um CHANGELOG_PROPOSTO.md com melhorias e checklist (6–12h por tarefa).

Estado atual do repositório e arquitetura de execução
O ponto de entrada é server.js, que inicializa Express, configura CORS com credentials: true, expõe /uploads como estático, habilita cookie-parser e monta as rotas centralizadas em /api. 

A documentação Swagger é gerada via swagger-jsdoc e servida em:

/docs (Swagger UI)
/api-docs.json (spec JSON) 
O conjunto mínimo de variáveis de ambiente exigidas em runtime (via config/env.js) inclui: JWT_SECRET, EMAIL_USER, EMAIL_PASS, APP_URL, BACKEND_URL, DB_HOST, DB_USER, DB_PASSWORD, DB_NAME. 

O .env.example publicado, porém, não lista vários desses campos obrigatórios (ex.: APP_URL, BACKEND_URL, EMAIL_*), o que precisa ser corrigido para evitar falhas de boot. 

Há scripts de execução e testes no package.json (ex.: start, dev, test, test:cov) e licença declarada como ISC. 

Observação crítica sobre integridade do tree no branch main
O server.js referencia módulos essenciais (./middleware/adaptiveRateLimiter, ./middleware/errorHandler, ./errors/AppError, ./constants/ErrorCodes) que não foram recuperáveis no tree via GitHub Raw (indicador de ausência no branch publicado ou divergência de caminho/nomes). Isso, por si só, já impede a execução real sem ajustes. 

O agregador routes/index.js também referencia um volume grande de “sub-rotas” (ex.: productById, publicCategorias, favorites, authRoutes, múltiplos módulos admin). Em vários casos, os arquivos correspondentes não foram encontrados no branch (exemplo: routes/productById.js). 

Autenticação e sessão por cookie
Usuário final
O login do usuário é exposto em /api/login (POST). A rota delega para AuthController.login, que:

valida credenciais contra a tabela usuarios
assina JWT (authConfig.sign({ id }))
grava o token em cookie HttpOnly chamado auth_token com:
secure apenas em produção
sameSite: strict em produção / lax fora
maxAge: 7 dias
path: "/" 
A expiração do JWT, por padrão, é controlada por JWT_EXPIRATION (default 1h) via config/env.js. Isso cria um ponto de atenção: o cookie pode durar 7 dias, mas o JWT pode expirar em 1h, produzindo 401 até novo login, a menos que JWT_EXPIRATION seja alinhada ao maxAge do cookie. 

O controller contém também logout() (limpa auth_token), mas não há, no branch publicado, um arquivo de rotas confirmado que exponha esse logout (o agregador aponta para authRoutes, porém o arquivo não foi recuperado). 

Admin
O login de admin é implementado em /api/admin/login (POST). Em caso de sucesso:

emite JWT com payload contendo id, email, role, role_id e permissions
define cookie HttpOnly adminToken com:
maxAge: 2h
sameSite: strict
secure apenas em produção
path: "/" 
O middleware verifyAdmin valida o token buscando primeiro req.cookies.adminToken e, como fallback, Authorization: Bearer <token>. 

O endpoint /api/admin/me é protegido por verifyAdmin. 

O endpoint /api/admin/logout limpa o cookie adminToken. 

Middleware de autenticação do usuário (lacuna)
Diversas rotas de usuário (ex.: carrinho e checkout) fazem require("../middleware/authenticateToken"), mas esse arquivo não foi recuperado no branch atual; portanto, a lógica exata de leitura/validação do cookie auth_token não está disponível como fonte primária e precisa ser implementada/reintroduzida para que os contratos “protegidos” sejam executáveis. 

mermaid
Copiar
flowchart LR
  subgraph U[Usuário - cookie auth_token]
    A[POST /api/login] -->|Set-Cookie: auth_token=JWT<br/>HttpOnly; Max-Age=7d| B[Client/Browser]
    B -->|Cookie em requests (credentials)| C[Rotas protegidas<br/>(/api/cart, /api/checkout, ...)]
    C --> D[authenticateToken<br/>(AUSENTE no branch)]
    D --> E[req.user]
  end

  subgraph ADM[Admin - cookie adminToken]
    F[POST /api/admin/login] -->|Set-Cookie: adminToken=JWT<br/>HttpOnly; Max-Age=2h| G[Client/Browser]
    G -->|Cookie adminToken| H[/api/admin/me e demais rotas admin]
    H --> I[verifyAdmin]
    I --> J[req.admin + permissions]
    I --> K[Fallback: Authorization Bearer]
  end
Rotas HTTP mapeadas e contratos disponíveis
Como o roteamento é montado
O servidor monta app.use("/api", apiRoutes), onde apiRoutes vem de routes/index.js. 

Logo, todos os caminhos abaixo consideram prefixo /api quando a rota está dentro do router agregado.

O agregador routes/index.js tenta montar muitos módulos via loadRoute() e também monta um conjunto grande de rotas admin protegidas com verifyAdmin. 

Como parte desses arquivos não foi encontrada no branch, esta documentação separa:

Rotas com definição de endpoint visível no repo (contrato recuperável)
Rotas referenciadas no agregador, mas sem arquivo no branch (contrato indisponível no repo)
Mapa de endpoints com contrato recuperável
As rotas abaixo têm arquivo de rota com handlers visíveis no branch (mesmo que algumas dependências internas estejam ausentes, o “shape” do endpoint está definido no código do router).

mermaid
Copiar
flowchart TB
  root[/ /] --> docs[/docs (Swagger UI)]
  root --> spec[/api-docs.json (OpenAPI JSON)]
  root --> uploads[/uploads/* (static)]

  api[/api] --> products[/products]
  products --> products_list[GET /]
  products --> products_search[GET /search]

  api --> pub[/public]
  pub --> pub_prod[/produtos]
  pub_prod --> pub_search[GET /]
  pub_prod --> pub_review_post[POST /avaliacoes]
  pub_prod --> pub_review_list[GET /:id/avaliacoes]

  api --> auth[/login]
  auth --> login_post[POST /]

  api --> users[/users]
  users --> reg[POST /register]
  users --> forgot[POST /forgot-password]
  users --> reset[POST /reset-password]

  api --> cart[/cart]
  cart --> cart_get[GET /]
  cart --> cart_post[POST /items]
  cart --> cart_patch[PATCH /items]
  cart --> cart_del_item[DELETE /items/:produtoId]
  cart --> cart_del[DELETE /]

  api --> checkout[/checkout]
  checkout --> prev[POST /preview-cupom]
  checkout --> checkout_post[POST /]

  api --> admin[/admin]
  admin --> admin_login[POST /login]
  admin --> admin_me[GET /me]
  admin --> admin_logout[POST /logout]
Evidências no código (fontes primárias) para estas rotas:

/api/products (GET / e GET /search) em routes/products.js. 
/api/public/produtos (GET /, POST /avaliacoes, GET /:id/avaliacoes) em routes/publicProdutos.js. 
/api/login (POST /) em routes/login.js + cookie auth_token em controllers/authController.js. 
/api/users/register, /api/users/forgot-password, /api/users/reset-password em routes/users.js. 
/api/cart e sub-rotas em routes/cart.js. 
/api/checkout + /api/checkout/preview-cupom em routes/checkoutRoutes.js. 
/api/admin/login, /api/admin/me, /api/admin/logout em routes/adminLogin.js. 
Infra: /docs e /api-docs.json definidos em docs/swagger.js e montados no server.js. 
Rotas referenciadas no agregador, mas sem contrato disponível no branch
routes/index.js referencia um conjunto adicional de módulos (ex.: productById, publicCategorias, favorites, authRoutes, shippingRoutes, além de muitos módulos admin). 

Como exemplo concreto, o arquivo routes/productById.js não foi encontrado no branch publicado, tornando impossível documentar seu contrato real sem implementação. 

Arquivos gerados
md
Copiar
<!-- README.md -->

# Kavita Backend (API) — Documentação (pt-BR)

> **Status do branch `main`**  
> O roteador central (`routes/index.js`) referencia diversos módulos que não estão presentes no repositório publicado (e.g. `authRoutes`, várias rotas admin, etc.). Além disso, alguns middlewares essenciais citados pelo `server.js` não aparecem no branch.  
> Esta documentação descreve o que está **explicitamente definido** no código e aponta o que está **faltando** para operação plena.

## Visão geral

O **Kavita Backend** é uma API REST para um e-commerce (produtos, checkout, carrinho e área admin). O servidor:
- monta a API sob `/api`
- serve Swagger UI em `/docs` e o JSON em `/api-docs.json`
- suporta autenticação via **JWT em cookie HttpOnly** (usuário e admin)
- usa MySQL via `mysql2/promise` (pool)

## Requisitos

- Node.js (compatível com Express 4)
- MySQL (schema via migrations em `migrations/`)
- npm

## Instalação

```bash
git clone https://github.com/rickjs2005/kavita-backend.git
cd kavita-backend
npm install
Variáveis de ambiente
O backend valida variáveis obrigatórias no boot. Crie .env na raiz.

Obrigatórias (conforme config/env.js)
JWT_SECRET
EMAIL_USER
EMAIL_PASS
APP_URL
BACKEND_URL
DB_HOST
DB_USER
DB_PASSWORD
DB_NAME
Opcionais (recomendadas)
JWT_EXPIRATION (default: 1h)
DB_PORT (default: 3306)
ALLOWED_ORIGINS (CSV; importante para cookies em frontend separado)
PORT (default: 5000)
NODE_ENV (development | production | test)
DISABLE_NOTIFICATIONS=true (desliga worker de notificações)
Observação: o .env.example do repositório está incompleto em relação às obrigatórias do config/env.js.

Banco de dados (migrations)
Existe uma migration inicial em migrations/001_create_core_tables.sql.

bash
Copiar
# Exemplo (ajuste usuário/banco)
mysql -u root -p kavita < migrations/001_create_core_tables.sql
Atenção: certas rotas usam tabelas/colunas que não constam nessa migration inicial (ex.: usuarios.senha, usuarios.cpf, carrinhos, cupons, etc.). Veja o checklist de melhorias (ao final).

Como executar
Desenvolvimento
bash
Copiar
npm run dev
# servidor em http://localhost:5000 (por padrão)
# Swagger UI: http://localhost:5000/docs
# Spec JSON:  http://localhost:5000/api-docs.json
Produção
bash
Copiar
npm start
Autenticação por cookie (recomendado)
Usuário — cookie auth_token
Endpoint: POST /api/login
Em sucesso, a resposta grava: Set-Cookie: auth_token=<JWT>; HttpOnly; Path=/; Max-Age=...
Para requests autenticadas em browser, use fetch(..., { credentials: "include" })
Em curl, use -c cookies.txt (salvar) e -b cookies.txt (reusar)
Admin — cookie adminToken
Endpoint: POST /api/admin/login
Cookie: adminToken (JWT) com maxAge 2h
Rota protegida exemplo: GET /api/admin/me
Logout: POST /api/admin/logout (limpa cookie)
Diagramas (Mermaid)
Fluxo de autenticação
mermaid
Copiar
flowchart LR
  A[POST /api/login] -->|Set-Cookie auth_token| B[Client]
  B -->|Cookie + credentials| C[Rotas protegidas]
  C --> D[authenticateToken (precisa existir)]
  D --> E[req.user]

  F[POST /api/admin/login] -->|Set-Cookie adminToken| G[Client]
  G --> H[GET /api/admin/me]
  H --> I[verifyAdmin]
  I --> J[req.admin]
Mapa de endpoints (alto nível)
mermaid
Copiar
flowchart TB
  api[/api] --> products[/products]
  products --> p1[GET /]
  products --> p2[GET /search]

  api --> public[/public/produtos]
  public --> pub1[GET /]
  public --> pub2[POST /avaliacoes]
  public --> pub3[GET /:id/avaliacoes]

  api --> login[/login]
  login --> l1[POST /]

  api --> users[/users]
  users --> u1[POST /register]
  users --> u2[POST /forgot-password]
  users --> u3[POST /reset-password]

  api --> cart[/cart]
  cart --> c1[GET /]
  cart --> c2[POST /items]
  cart --> c3[PATCH /items]
  cart --> c4[DELETE /items/:produtoId]
  cart --> c5[DELETE /]

  api --> checkout[/checkout]
  checkout --> ch1[POST /preview-cupom]
  checkout --> ch2[POST /]

  api --> admin[/admin]
  admin --> a1[POST /login]
  admin --> a2[GET /me]
  admin --> a3[POST /logout]
Exemplos de uso (curl)
Listar produtos (público)
bash
Copiar
curl "http://localhost:5000/api/products?page=1&limit=12&sort=id&order=desc"
Busca avançada de produtos
bash
Copiar
curl "http://localhost:5000/api/products/search?q=fertilizante&promo=true&sort=newest&page=1&limit=12"
Busca pública simplificada por nome
bash
Copiar
curl "http://localhost:5000/api/public/produtos?busca=fertilizante&limit=10"
Login do usuário (salvando cookie)
bash
Copiar
curl -i -c cookies.txt \
  -H "Content-Type: application/json" \
  -d '{"email":"cliente@email.com","senha":"123456"}' \
  "http://localhost:5000/api/login"
Reusar cookie em rota protegida (ex.: carrinho)
bash
Copiar
curl -b cookies.txt "http://localhost:5000/api/cart"
Admin login + /me
bash
Copiar
# login admin
curl -i -c admin_cookies.txt \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@kavita.com","senha":"123456"}' \
  "http://localhost:5000/api/admin/login"

# perfil admin
curl -b admin_cookies.txt "http://localhost:5000/api/admin/me"
Exemplos de uso (JavaScript fetch)
Chamada pública
js
Copiar
const res = await fetch("http://localhost:5000/api/products?page=1&limit=12");
const data = await res.json();
console.log(data);
Login + chamadas autenticadas via cookie
js
Copiar
// Login (cookie HttpOnly)
await fetch("http://localhost:5000/api/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "include",
  body: JSON.stringify({ email: "cliente@email.com", senha: "123456" })
});

// Carrinho (usa o cookie automaticamente)
const cart = await fetch("http://localhost:5000/api/cart", {
  credentials: "include"
}).then(r => r.json());

console.log(cart);
Testes
Scripts disponíveis:

npm test
npm run test:watch
npm run test:cov
npm run test:ci
Observação: o config/env.js exige variáveis além de JWT_SECRET; em ambiente de testes, garanta defaults no setup.

Deploy (guia rápido)
Defina NODE_ENV=production
Configure ALLOWED_ORIGINS com o(s) domínio(s) do frontend
Garanta HTTPS se for usar cookies cross-site (relevante para secure e sameSite)
Rode npm ci && npm start com processo gerenciável (ex.: systemd/PM2) e reverse proxy
Licença
Licença declarada no package.json: ISC.

yaml
Copiar

```yaml
# openapi.yaml

openapi: 3.0.3
info:
  title: Kavita Backend API
  version: "1.0.0"
  description: >
    Especificação OpenAPI gerada a partir das rotas existentes no branch main do repositório.
    Observação: há referências a módulos ausentes no tree publicado; esta spec cobre apenas contratos
    cujos handlers estão visíveis nos arquivos de rotas recuperados.
  license:
    name: ISC

servers:
  - url: http://localhost:5000
    description: Dev local

tags:
  - name: Infra
  - name: Produtos
  - name: Public
  - name: Usuários
  - name: Carrinho
  - name: Checkout
  - name: Admin

components:
  securitySchemes:
    cookieAuth:
      type: apiKey
      in: cookie
      name: auth_token
      description: JWT do usuário em cookie HttpOnly (definido no login).
    adminCookieAuth:
      type: apiKey
      in: cookie
      name: adminToken
      description: JWT do admin em cookie HttpOnly (definido no login admin).
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
      description: Authorization: Bearer <token> (fallback aceito por verifyAdmin).

  schemas:
    ErrorResponse:
      type: object
      properties:
        message:
          type: string
          example: Erro interno no servidor.
        code:
          type: string
          nullable: true
          example: SERVER_ERROR
      required: [message]

    UserSafe:
      type: object
      properties:
        id: { type: integer, example: 10 }
        nome: { type: string, example: "João da Silva" }
        email: { type: string, format: email, example: "joao@email.com" }
      required: [id, nome, email]

    LoginRequest:
      type: object
      required: [email]
      properties:
        email:
          type: string
          format: email
          example: "cliente@email.com"
        senha:
          type: string
          format: password
          example: "123456"
        password:
          type: string
          format: password
          description: Alias aceito pela rota (será mapeado internamente para "senha").
          example: "123456"

    LoginResponse:
      type: object
      properties:
        message: { type: string, example: "Login bem-sucedido!" }
        user:
          $ref: "#/components/schemas/UserSafe"
      required: [message, user]

    RegisterRequest:
      type: object
      required: [nome, email, senha, cpf]
      properties:
        nome: { type: string, example: "João da Silva" }
        email: { type: string, format: email, example: "joao@email.com" }
        senha: { type: string, format: password, example: "123456" }
        cpf: { type: string, example: "111.111.111-11" }

    RegisterResponse:
      type: object
      properties:
        mensagem:
          type: string
          example: "Conta criada com sucesso! Faça login para continuar."

    ForgotPasswordRequest:
      type: object
      required: [email]
      properties:
        email: { type: string, format: email, example: "usuario@email.com" }

    ForgotPasswordResponse:
      type: object
      properties:
        mensagem:
          type: string
          example: "Se este e-mail estiver cadastrado, enviaremos um link para redefinir a senha."

    ResetPasswordRequest:
      type: object
      required: [token, novaSenha]
      properties:
        token: { type: string, example: "abc123" }
        novaSenha: { type: string, format: password, example: "novaSenha#2026" }

    ResetPasswordResponse:
      type: object
      properties:
        mensagem:
          type: string
          example: "Senha redefinida com sucesso!"

    Product:
      type: object
      properties:
        id: { type: integer, example: 1 }
        name: { type: string, example: "Produto X" }
        description: { type: string, nullable: true }
        price: { type: number, format: float, example: 19.9 }
        quantity: { type: integer, example: 10 }
        category_id: { type: integer, nullable: true, example: 3 }
        image: { type: string, nullable: true }
        images:
          type: array
          items: { type: string }
      required: [id, name]

    ProductsListResponse:
      type: object
      properties:
        data:
          type: array
          items: { $ref: "#/components/schemas/Product" }
        page: { type: integer, example: 1 }
        limit: { type: integer, example: 12 }
        total: { type: integer, example: 120 }
        totalPages: { type: integer, example: 10 }
        sort: { type: string, example: "id" }
        order: { type: string, example: "desc" }
      required: [data, page, limit, total, totalPages]

    ProductSearchItem:
      type: object
      properties:
        id: { type: integer, example: 1 }
        name: { type: string }
        description: { type: string, nullable: true }
        category_id: { type: integer, nullable: true }
        original_price: { type: number, format: float }
        final_price: { type: number, format: float }
        discount_percent: { type: number, format: float }
        is_promo: { type: boolean }
        created_at: { type: string, format: date-time }
        sold_count: { type: integer }
        quantity: { type: integer }
        images:
          type: array
          items: { type: string }

    ProductSearchResponse:
      type: object
      properties:
        products:
          type: array
          items: { $ref: "#/components/schemas/ProductSearchItem" }
        pagination:
          type: object
          properties:
            page: { type: integer, example: 1 }
            limit: { type: integer, example: 12 }
            total: { type: integer, example: 200 }
            totalPages: { type: integer, example: 17 }

    PublicProductSummary:
      type: object
      properties:
        id: { type: integer, example: 1 }
        name: { type: string, example: "Fertilizante X" }
        price: { type: number, format: float, example: 99.9 }
        image: { type: string, nullable: true }
        rating_avg: { type: number, format: float, example: 4.6 }
        rating_count: { type: integer, example: 20 }
        shipping_free: { type: boolean, example: true }
        shipping_free_from_qty: { type: integer, nullable: true, example: 3 }

    CreateProdutoAvaliacaoRequest:
      type: object
      required: [produto_id, nota]
      properties:
        produto_id: { type: integer, example: 123 }
        nota: { type: integer, minimum: 1, maximum: 5, example: 5 }
        comentario: { type: string, nullable: true, example: "Produto excelente!" }

    CreateProdutoAvaliacaoResponse:
      type: object
      properties:
        message: { type: string, example: "Avaliação registrada com sucesso." }

    ProdutoAvaliacao:
      type: object
      properties:
        nota: { type: integer, example: 5 }
        comentario: { type: string, nullable: true }
        created_at: { type: string, format: date-time }
        usuario_nome: { type: string, nullable: true }

    CartItem:
      type: object
      properties:
        item_id: { type: integer, example: 321 }
        produto_id: { type: integer, example: 105 }
        nome: { type: string, example: "Ração Premium" }
        image: { type: string, nullable: true }
        valor_unitario: { type: number, example: 79.9 }
        quantidade: { type: integer, example: 2 }
        stock: { type: integer, example: 7 }

    CartGetResponse:
      type: object
      properties:
        carrinho_id: { type: integer, nullable: true, example: 12 }
        items:
          type: array
          items: { $ref: "#/components/schemas/CartItem" }

    CartMutationResponse:
      type: object
      properties:
        success: { type: boolean, example: true }
        message: { type: string, example: "Produto adicionado ao carrinho" }
        produto_id: { type: integer, example: 105 }
        quantidade: { type: integer, example: 3 }
        stock: { type: integer, example: 7 }

    StockLimitError:
      type: object
      properties:
        code: { type: string, example: "STOCK_LIMIT" }
        message: { type: string, example: "Limite de estoque atingido." }
        max: { type: integer, example: 7 }
        current: { type: integer, nullable: true, example: 7 }
        requested: { type: integer, example: 8 }

    PreviewCupomRequest:
      type: object
      required: [codigo, total]
      properties:
        codigo: { type: string, example: "PROMO10" }
        total: { type: number, format: float, example: 189.9 }

    PreviewCupomResponse:
      type: object
      properties:
        success: { type: boolean, example: true }
        message: { type: string, example: "Cupom aplicado com sucesso." }
        desconto: { type: number, example: 18.99 }
        total_original: { type: number, example: 189.9 }
        total_com_desconto: { type: number, example: 170.91 }
        cupom:
          type: object
          properties:
            id: { type: integer, example: 1 }
            codigo: { type: string, example: "PROMO10" }
            tipo: { type: string, example: "percentual" }
            valor: { type: number, example: 10 }

    CheckoutProduto:
      type: object
      required: [id, quantidade]
      properties:
        id: { type: integer, example: 1 }
        quantidade: { type: integer, example: 2 }

    Endereco:
      type: object
      properties:
        cep: { type: string, example: "36940000" }
        rua: { type: string, nullable: true, example: "Rua das Flores" }
        endereco: { type: string, nullable: true, description: "Alias aceito para rua." }
        logradouro: { type: string, nullable: true, description: "Alias aceito para rua." }
        numero: { type: string, nullable: true, example: "288" }
        sem_numero: { type: boolean, nullable: true, example: false }
        bairro: { type: string, nullable: true, example: "Centro" }
        cidade: { type: string, example: "Manhuaçu" }
        estado: { type: string, example: "MG" }
        complemento: { type: string, nullable: true }
        ponto_referencia: { type: string, nullable: true }
        observacoes_acesso: { type: string, nullable: true }
        tipo_localidade:
          type: string
          enum: [URBANA, RURAL]
          example: URBANA
        comunidade: { type: string, nullable: true }

    CheckoutBody:
      type: object
      required: [formaPagamento, produtos]
      properties:
        entrega_tipo:
          type: string
          enum: [ENTREGA, RETIRADA]
          example: ENTREGA
        formaPagamento:
          type: string
          example: "Cartão (Mercado Pago)"
        endereco:
          $ref: "#/components/schemas/Endereco"
        produtos:
          type: array
          items: { $ref: "#/components/schemas/CheckoutProduto" }
        total:
          type: number
          nullable: true
        cupom_codigo:
          type: string
          nullable: true

    CheckoutResponse:
      type: object
      properties:
        success: { type: boolean, example: true }
        message: { type: string, example: "Pedido criado com sucesso" }
        pedido_id: { type: integer, example: 123 }
        total: { type: number, example: 150.5 }
        nota_fiscal_aviso:
          type: string
          example: "Nota fiscal será entregue junto com o produto."

    AdminLoginRequest:
      type: object
      required: [email, senha]
      properties:
        email: { type: string, format: email, example: "admin@kavita.com" }
        senha: { type: string, format: password, example: "123456" }

    AdminLoginResponse:
      type: object
      properties:
        message: { type: string, example: "Login realizado com sucesso." }
        token:
          type: string
          description: "JWT também enviado em cookie HttpOnly adminToken (campo informativo)."
        admin:
          type: object
          properties:
            id: { type: integer, example: 1 }
            email: { type: string, example: "admin@kavita.com" }
            nome: { type: string, example: "Admin Master" }
            role: { type: string, example: "master" }
            role_id: { type: integer, nullable: true, example: 1 }
            permissions:
              type: array
              items: { type: string }
              example: ["admin.logs.view", "admin.config.edit"]

    AdminMeResponse:
      type: object
      properties:
        id: { type: integer, example: 1 }
        nome: { type: string, example: "Admin Master" }
        email: { type: string, example: "admin@kavita.com" }
        role: { type: string, example: "master" }
        role_id: { type: integer, nullable: true, example: 1 }
        permissions:
          type: array
          items: { type: string }

    AdminLogoutResponse:
      type: object
      properties:
        message: { type: string, example: "Logout realizado com sucesso." }

paths:
  /api-docs.json:
    get:
      tags: [Infra]
      summary: Retorna a especificação gerada pelo swagger-jsdoc (JSON)
      responses:
        "200":
          description: OpenAPI JSON
          content:
            application/json: {}

  /docs:
    get:
      tags: [Infra]
      summary: Swagger UI (HTML)
      responses:
        "200":
          description: Página HTML do Swagger UI

  /api/products:
    get:
      tags: [Produtos]
      summary: Lista produtos com paginação e filtro opcional por categoria e busca
      parameters:
        - in: query
          name: category
          schema: { type: string, example: "all" }
          description: ID numérico ou slug/nome (usa tabela categories). Default "all".
        - in: query
          name: search
          schema: { type: string, example: "fertilizante" }
        - in: query
          name: page
          schema: { type: integer, default: 1, minimum: 1 }
        - in: query
          name: limit
          schema: { type: integer, default: 12, minimum: 1, maximum: 100 }
        - in: query
          name: sort
          schema:
            type: string
            enum: [id, name, price, quantity]
            default: id
        - in: query
          name: order
          schema:
            type: string
            enum: [asc, desc]
            default: desc
      responses:
        "200":
          description: Lista paginada
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ProductsListResponse" }
        "404":
          description: Categoria não encontrada
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ErrorResponse" }
        "500":
          description: Erro interno
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ErrorResponse" }

  /api/products/search:
    get:
      tags: [Produtos]
      summary: Busca avançada com filtros por categoria, preço e promoções
      parameters:
        - in: query
          name: q
          schema: { type: string }
        - in: query
          name: categories
          schema: { type: string, example: "1,2,3" }
        - in: query
          name: category_id
          schema: { type: integer }
        - in: query
          name: category
          schema: { type: integer }
        - in: query
          name: minPrice
          schema: { type: number }
        - in: query
          name: maxPrice
          schema: { type: number }
        - in: query
          name: promo
          schema: { type: boolean, example: true }
        - in: query
          name: sort
          schema:
            type: string
            enum: [newest, price_asc, price_desc, discount, best_sellers]
            default: newest
        - in: query
          name: page
          schema: { type: integer, default: 1, minimum: 1 }
        - in: query
          name: limit
          schema: { type: integer, default: 12, minimum: 1, maximum: 60 }
      responses:
        "200":
          description: Lista paginada
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ProductSearchResponse" }
        "400":
          description: Parâmetros inválidos
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ErrorResponse" }
        "500":
          description: Erro interno
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ErrorResponse" }

  /api/public/produtos:
    get:
      tags: [Public]
      summary: Busca rápida por nome do produto
      parameters:
        - in: query
          name: busca
          required: true
          schema: { type: string, example: "fertilizante" }
        - in: query
          name: limit
          required: false
          schema: { type: integer, default: 10, minimum: 1, maximum: 50 }
      responses:
        "200":
          description: Lista (até limit)
          content:
            application/json:
              schema:
                type: array
                items: { $ref: "#/components/schemas/PublicProductSummary" }
        "500":
          description: Erro interno
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ErrorResponse" }

  /api/public/produtos/avaliacoes:
    post:
      tags: [Public]
      summary: Avalia um produto (requer autenticação)
      security:
        - cookieAuth: []
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/CreateProdutoAvaliacaoRequest" }
      responses:
        "201":
          description: Avaliação criada
          content:
            application/json:
              schema: { $ref: "#/components/schemas/CreateProdutoAvaliacaoResponse" }
        "400":
          description: Validação
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ErrorResponse" }
        "401":
          description: Não autenticado
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ErrorResponse" }
        "500":
          description: Erro interno
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ErrorResponse" }

  /api/public/produtos/{id}/avaliacoes:
    get:
      tags: [Public]
      summary: Lista avaliações de um produto
      parameters:
        - in: path
          name: id
          required: true
          schema: { type: integer, example: 123 }
      responses:
        "200":
          description: Lista de avaliações
          content:
            application/json:
              schema:
                type: array
                items: { $ref: "#/components/schemas/ProdutoAvaliacao" }
        "400":
          description: ID inválido
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ErrorResponse" }
        "500":
          description: Erro interno
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ErrorResponse" }

  /api/login:
    post:
      tags: [Usuários]
      summary: Login de usuário (define cookie auth_token)
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/LoginRequest" }
      responses:
        "200":
          description: Login OK
          headers:
            Set-Cookie:
              schema:
                type: string
              description: auth_token=<jwt>; HttpOnly; Path=/; Max-Age=...
          content:
            application/json:
              schema: { $ref: "#/components/schemas/LoginResponse" }
        "401":
          description: Credenciais inválidas
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ErrorResponse" }
        "500":
          description: Erro interno
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ErrorResponse" }

  /api/users/register:
    post:
      tags: [Usuários]
      summary: Cadastro de usuário (com CPF)
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/RegisterRequest" }
      responses:
        "201":
          description: Conta criada
          content:
            application/json:
              schema: { $ref: "#/components/schemas/RegisterResponse" }
        "400":
          description: Validação / duplicidade
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ErrorResponse" }
        "500":
          description: Erro interno
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ErrorResponse" }

  /api/users/forgot-password:
    post:
      tags: [Usuários]
      summary: Solicita email de recuperação (resposta neutra)
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/ForgotPasswordRequest" }
      responses:
        "200":
          description: Resposta neutra
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ForgotPasswordResponse" }
        "400":
          description: Validação
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ErrorResponse" }
        "500":
          description: Erro interno
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ErrorResponse" }

  /api/users/reset-password:
    post:
      tags: [Usuários]
      summary: Redefine senha via token
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/ResetPasswordRequest" }
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ResetPasswordResponse" }
        "400":
          description: Validação
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ErrorResponse" }
        "401":
          description: Token inválido/expirado
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ErrorResponse" }
        "500":
          description: Erro interno
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ErrorResponse" }

  /api/cart:
    get:
      tags: [Carrinho]
      summary: Retorna carrinho aberto do usuário autenticado
      security:
        - cookieAuth: []
        - bearerAuth: []
      responses:
        "200":
          description: Carrinho atual
          content:
            application/json:
              schema: { $ref: "#/components/schemas/CartGetResponse" }
        "401":
          description: Não autenticado
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ErrorResponse" }
        "500":
          description: Erro interno
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ErrorResponse" }

    delete:
      tags: [Carrinho]
      summary: Limpa o carrinho (remove itens e fecha status)
      security:
        - cookieAuth: []
        - bearerAuth: []
      responses:
        "200":
          description: Carrinho limpo
          content:
            application/json:
              schema: { $ref: "#/components/schemas/CartMutationResponse" }
        "401":
          description: Não autenticado
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ErrorResponse" }

  /api/cart/items:
    post:
      tags: [Carrinho]
      summary: Adiciona produto ao carrinho (valida estoque)
      security:
        - cookieAuth: []
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [produto_id, quantidade]
              properties:
                produto_id: { type: integer, example: 105 }
                quantidade: { type: integer, example: 1 }
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema: { $ref: "#/components/schemas/CartMutationResponse" }
        "409":
          description: Limite de estoque
          content:
            application/json:
              schema: { $ref: "#/components/schemas/StockLimitError" }

    patch:
      tags: [Carrinho]
      summary: Atualiza quantidade (<=0 remove)
      security:
        - cookieAuth: []
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [produto_id, quantidade]
              properties:
                produto_id: { type: integer, example: 105 }
                quantidade: { type: integer, example: 3 }
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema: { $ref: "#/components/schemas/CartMutationResponse" }
        "409":
          description: Limite de estoque
          content:
            application/json:
              schema: { $ref: "#/components/schemas/StockLimitError" }

  /api/cart/items/{produtoId}:
    delete:
      tags: [Carrinho]
      summary: Remove um item do carrinho
      security:
        - cookieAuth: []
        - bearerAuth: []
      parameters:
        - in: path
          name: produtoId
          required: true
          schema: { type: integer, example: 105 }
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                type: object
                properties:
                  success: { type: boolean, example: true }
                  message: { type: string, example: "Item removido do carrinho." }

  /api/checkout/preview-cupom:
    post:
      tags: [Checkout]
      summary: Previsualiza e valida cupom
      security:
        - cookieAuth: []
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/PreviewCupomRequest" }
      responses:
        "200":
          description: Cupom válido
          content:
            application/json:
              schema: { $ref: "#/components/schemas/PreviewCupomResponse" }
        "400":
          description: Cupom não aplicável / inválido
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ErrorResponse" }

  /api/checkout:
    post:
      tags: [Checkout]
      summary: Cria pedido (checkout)
      security:
        - cookieAuth: []
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/CheckoutBody" }
      responses:
        "201":
          description: Pedido criado
          content:
            application/json:
              schema: { $ref: "#/components/schemas/CheckoutResponse" }
        "400":
          description: Validação / estoque
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ErrorResponse" }
        "401":
          description: Não autenticado
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ErrorResponse" }

  /api/admin/login:
    post:
      tags: [Admin]
      summary: Login de administrador (define cookie adminToken)
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/AdminLoginRequest" }
      responses:
        "200":
          description: Login OK
          headers:
            Set-Cookie:
              schema: { type: string }
              description: adminToken=<jwt>; HttpOnly; Path=/; Max-Age=7200
          content:
            application/json:
              schema: { $ref: "#/components/schemas/AdminLoginResponse" }
        "400":
          description: Campos obrigatórios ausentes
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ErrorResponse" }
        "404":
          description: Admin não encontrado
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ErrorResponse" }
        "401":
          description: Senha incorreta
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ErrorResponse" }

  /api/admin/me:
    get:
      tags: [Admin]
      summary: Retorna o admin autenticado
      security:
        - adminCookieAuth: []
        - bearerAuth: []
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema: { $ref: "#/components/schemas/AdminMeResponse" }
        "401":
          description: Não autenticado
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ErrorResponse" }

  /api/admin/logout:
    post:
      tags: [Admin]
      summary: Logout do admin (limpa cookie adminToken)
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema: { $ref: "#/components/schemas/AdminLogoutResponse" }
md
Copiar
<!-- contracts_table.md -->

# Contratos de API — Kavita Backend (branch main)

> Base URL (dev): `http://localhost:5000`  
> Prefixo da API: `/api`  
> Cookies usados: `auth_token` (usuário) e `adminToken` (admin)

## Endpoints com contrato recuperável no repositório

| Método | Path | Auth | Query | Path params | Body (JSON) | Respostas (principais) | Exemplo (curl) |
|---|---|---|---|---|---|---|---|
| GET | `/api/products` | Não | `category,search,page,limit,sort,order` | – | – | 200, 404 (categoria), 500 | `curl "http://localhost:5000/api/products?page=1&limit=12"` |
| GET | `/api/products/search` | Não | `q,categories,category_id,category,minPrice,maxPrice,promo,sort,page,limit` | – | – | 200, 400, 500 | `curl "http://localhost:5000/api/products/search?q=fertilizante&promo=true"` |
| GET | `/api/public/produtos` | Não | `busca (obrig.), limit` | – | – | 200, 500 | `curl "http://localhost:5000/api/public/produtos?busca=fertilizante&limit=10"` |
| POST | `/api/public/produtos/avaliacoes` | Sim (usuário) | – | – | `{produto_id,nota,comentario?}` | 201, 400, 401, 500 | `curl -b cookies.txt -H "Content-Type: application/json" -d '{"produto_id":1,"nota":5,"comentario":"Ótimo"}' http://localhost:5000/api/public/produtos/avaliacoes` |
| GET | `/api/public/produtos/:id/avaliacoes` | Não | – | `id` | – | 200, 400, 500 | `curl "http://localhost:5000/api/public/produtos/1/avaliacoes"` |
| POST | `/api/login` | Não | – | – | `{email,senha}` (`password` aceito como alias) | 200 (Set-Cookie), 401, 500 | `curl -i -c cookies.txt -H "Content-Type: application/json" -d '{"email":"x","senha":"y"}' http://localhost:5000/api/login` |
| POST | `/api/users/register` | Não | – | – | `{nome,email,senha,cpf}` | 201, 400, 500 | `curl -H "Content-Type: application/json" -d '{"nome":"João","email":"a@b.com","senha":"123","cpf":"111.111.111-11"}' http://localhost:5000/api/users/register` |
| POST | `/api/users/forgot-password` | Não | – | – | `{email}` | 200, 400, 500 | `curl -H "Content-Type: application/json" -d '{"email":"a@b.com"}' http://localhost:5000/api/users/forgot-password` |
| POST | `/api/users/reset-password` | Não | – | – | `{token,novaSenha}` | 200, 400, 401, 500 | `curl -H "Content-Type: application/json" -d '{"token":"abc","novaSenha":"nova#2026"}' http://localhost:5000/api/users/reset-password` |
| GET | `/api/cart` | Sim (usuário) | – | – | – | 200, 401, 500 | `curl -b cookies.txt http://localhost:5000/api/cart` |
| POST | `/api/cart/items` | Sim (usuário) | – | – | `{produto_id,quantidade}` | 200, 400, 401, 404, 409, 500 | `curl -b cookies.txt -H "Content-Type: application/json" -d '{"produto_id":105,"quantidade":1}' http://localhost:5000/api/cart/items` |
| PATCH | `/api/cart/items` | Sim (usuário) | – | – | `{produto_id,quantidade}` | 200, 400, 401, 404, 409, 500 | `curl -X PATCH -b cookies.txt -H "Content-Type: application/json" -d '{"produto_id":105,"quantidade":3}' http://localhost:5000/api/cart/items` |
| DELETE | `/api/cart/items/:produtoId` | Sim (usuário) | – | `produtoId` | – | 200, 400, 401, 500 | `curl -X DELETE -b cookies.txt http://localhost:5000/api/cart/items/105` |
| DELETE | `/api/cart` | Sim (usuário) | – | – | – | 200, 401, 500 | `curl -X DELETE -b cookies.txt http://localhost:5000/api/cart` |
| POST | `/api/checkout/preview-cupom` | Sim (usuário) | – | – | `{codigo,total}` | 200, 400, 500 | `curl -b cookies.txt -H "Content-Type: application/json" -d '{"codigo":"PROMO10","total":189.9}' http://localhost:5000/api/checkout/preview-cupom` |
| POST | `/api/checkout` | Sim (usuário) | – | – | `CheckoutBody` (entrega_tipo, formaPagamento, endereco?, produtos[], cupom_codigo?) | 201, 400, 401, 500 | `curl -b cookies.txt -H "Content-Type: application/json" -d '{"entrega_tipo":"ENTREGA","formaPagamento":"Pix","endereco":{"cep":"36940000","rua":"Rua X","bairro":"Centro","numero":"10","cidade":"Manhuaçu","estado":"MG"},"produtos":[{"id":1,"quantidade":2}]}' http://localhost:5000/api/checkout` |
| POST | `/api/admin/login` | Não | – | – | `{email,senha}` | 200 (Set-Cookie adminToken), 400, 401, 404, 500 | `curl -i -c admin_cookies.txt -H "Content-Type: application/json" -d '{"email":"admin@kavita.com","senha":"123456"}' http://localhost:5000/api/admin/login` |
| GET | `/api/admin/me` | Sim (admin) | – | – | – | 200, 401, 404, 500 | `curl -b admin_cookies.txt http://localhost:5000/api/admin/me` |
| POST | `/api/admin/logout` | Não (efetivamente) | – | – | – | 200 | `curl -b admin_cookies.txt -X POST http://localhost:5000/api/admin/logout` |
| GET | `/api-docs.json` | Não | – | – | – | 200 | `curl http://localhost:5000/api-docs.json` |
| GET | `/docs` | Não | – | – | – | 200 | abrir no navegador |

## Rotas referenciadas no agregador, mas sem contrato no branch

O `routes/index.js` tenta montar diversos módulos adicionais (ex.: `/api/products/:id`, `/api/public/categorias`, `/api/favorites`, `/api/shipping`, múltiplas rotas admin). Sem os arquivos no repositório publicado, os contratos não podem ser descritos com precisão.
md
Copiar
<!-- CHANGELOG_PROPOSTO.md -->

# Changelog proposto — Alinhamento de documentação e contratos (6–12h por tarefa)

## Objetivo
Deixar o backend executável no branch main, padronizar contratos reais, consolidar autenticação por cookie e gerar/documentar OpenAPI consistente.

## Tarefas sugeridas (cada uma estimada entre 6–12h)

### Restaurar/implementar infraestrutura mínima de boot
- [ ] Reintroduzir/implementar `middleware/adaptiveRateLimiter` e `middleware/errorHandler`
- [ ] Reintroduzir/implementar `errors/AppError` e `constants/ErrorCodes`
- [ ] Garantir que `server.js` suba sem exceptions em `NODE_ENV=development`
Estimativa: 8–12h

### Implementar middleware `authenticateToken` (usuário) e padronizar leitura de token
- [ ] Criar `middleware/authenticateToken` lendo `req.cookies.auth_token` (principal) e `Authorization: Bearer` (fallback)
- [ ] Injetar `req.user = { id }` a partir do JWT
- [ ] Padronizar respostas 401 (mensagem + código)
Estimativa: 6–10h

### Alinhar expiração do JWT x duração do cookie
- [ ] Decidir estratégia: cookie com duração = JWT ou implementar refresh token
- [ ] Ajustar `JWT_EXPIRATION` default e documentação
- [ ] Revisar `sameSite`/`secure` para cenários SPA + API em domínios diferentes
Estimativa: 6–8h

### Alinhar schema SQL (migrations) com o que as rotas usam
- [ ] Atualizar `usuarios` para incluir `senha` e `cpf` (e constraints necessárias)
- [ ] Criar migrations para `carrinhos`, `carrinho_itens`, `produto_avaliacoes`, `cupons`, `product_promotions`, `admins` e tabelas de roles/permissões
- [ ] Rodar smoke-test local com rotas: login, register, cart, avaliações
Estimativa: 10–12h

### Higienizar o agregador de rotas e remover/implementar módulos ausentes
- [ ] Para cada `loadRoute()` sem arquivo: remover referência **ou** adicionar arquivo com contrato real
- [ ] Para `routes/payment.js` (arquivo vazio): implementar router ou remover montagem
- [ ] Garantir consistência de nomes/paths e evitar “rotas fantasmas”
Estimativa: 6–10h

### Consolidar OpenAPI (cookie auth) e testes de integração mínimos
- [ ] Atualizar `docs/swagger.js` para incluir `securitySchemes` por cookie (e manter bearer como compat)
- [ ] Gerar spec estática `openapi.yaml` no repositório e comparar com `/api-docs.json`
- [ ] Adicionar testes Supertest para: /api/login, /api/products, /api/cart, /api/admin/login
Estimativa: 8–12h
Melhorias propostas e checklist com estimativas (6–12h por tarefa)
A lista abaixo deriva diretamente dos gargalos evidenciados no tree atual: dependências de boot ausentes no server.js, middleware de autenticação ausente referenciado por múltiplas rotas e inconsistência entre schema SQL inicial e colunas exigidas por rotas como users/register. 

A recomendação é executar o plano em blocos fechados de 6–12 horas (cada tarefa entrega um “incremento verificável”):

Restabelecer infraestrutura mínima de boot (rate limiter, handler de erros, AppError/ErrorCodes).
Implementar authenticateToken para usuário e padronizar contrato de auth (cookie principal + bearer fallback onde fizer sentido).
Decidir e alinhar política de expiração JWT x cookie (evitar cookie “vivo” com token “morto”).
Harmonizar migrations com as tabelas/colunas realmente usadas em rotas (ex.: usuarios.senha/cpf, carrinho, cupons e promoções).
Limpar o agregador de rotas: remover referências sem arquivo ou adicionar os módulos faltantes com contratos e testes.
Consolidar OpenAPI cookie-first (e manter compatibilidade bearer no admin), com smoke tests de integração.
Se essa sequência for seguida, o repositório sai do estado “documentação parcial + rotas não montáveis” para um estado “API executável + contratos verificáveis”, reduzindo risco de integração frontend/backend e tornando o Swagger /docs uma fonte de verdade consistente com o código. 
