Documentação e contratos do backend Kavita

md
Copiar
# Kavita Frontend

Frontend da plataforma **Kavita** (e-commerce + conteúdo “Kavita News”), construído com **Next.js (App Router)**, **React**, **TypeScript** e **Tailwind CSS**.

> **Importante (autenticação real do frontend):**
> - O frontend **envia cookies automaticamente** para o backend (via `credentials: "include"` / `withCredentials: true`).
> - O cookie do Admin é validado no middleware como **`adminToken`** (rota `/admin/*`).
> - O nome do cookie de sessão do usuário (cliente) **não é explicitado no frontend** — depende do backend.

## Visão geral

O projeto cobre:
- Área pública: navegação por categorias, carrinho, checkout, promoções, conteúdo informativo.
- Área administrativa (`/admin`): dashboard e módulos de gestão (produtos, pedidos, etc. — variam conforme backend).

## Tecnologias

- Next.js (App Router)
- React + TypeScript
- Tailwind CSS
- Axios e Fetch API
- React Hook Form + Zod
- Vitest + Testing Library

## Pré-requisitos

- Node.js (recomendado: LTS moderno compatível com Next.js 15)
- npm (ou gerenciador compatível; este repo contém `package-lock.json`, então **npm** é o caminho mais previsível)

## Configuração

### Variáveis de ambiente

Crie `.env.local` (não versionar) com:

```bash
# URL base do backend (HTTP API)
NEXT_PUBLIC_API_URL=http://localhost:5000

# Opcional: usado em alguns trechos server-side (fallbacks)
API_BASE=http://localhost:5000
NEXT_PUBLIC_API_BASE=http://localhost:5000
Observação: o frontend usa fallback para http://localhost:5000 se NEXT_PUBLIC_API_URL não existir.

Instalação
bash
Copiar
npm ci
ou

bash
Copiar
npm install
Rodando em desenvolvimento
bash
Copiar
npm run dev
A aplicação iniciará no padrão do Next.js (geralmente http://localhost:3000).

Build e execução em produção
bash
Copiar
npm run build
npm run start
Scripts disponíveis
npm run dev — modo desenvolvimento
npm run build — build de produção
npm run start — start do servidor Next em produção
npm run lint — lint
npm run test — Vitest em modo watch
npm run test:run — Vitest em modo CI
npm run test:coverage — cobertura
Dependências
Runtime (dependencies)
@hookform/resolvers
axios
clsx
framer-motion
lucide-react
next
react / react-dom
react-hook-form
react-hot-toast
react-icons
recharts
swr
zod
Dev/test (devDependencies)
vitest + @vitest/coverage-v8
@testing-library/*
jsdom
eslint + eslint-config-next
typescript
@types/*
A lista exata/versões está em package.json.

Testes
Unitários e de componentes: Vitest + Testing Library.
Sugestão de CI: rodar npm run test:run e npm run test:coverage.
Lint
Rodar:

bash
Copiar
npm run lint
Observação: o next.config.ts ignora ESLint durante o build (ignoreDuringBuilds: true). Isso é deliberado para não quebrar o build, mas exige disciplina de CI/PR para manter lint “verde”.

Contribuição
Crie branch a partir de main.
Faça commits pequenos e descritivos.
Antes de abrir PR:
npm run lint
npm run test:run
npm run build (sanidade)
PR deve incluir:
descrição do problema/solução
prints (quando UI)
checklist de testes
Convenções recomendadas
Padrão de commits: Conventional Commits (opcional, recomendado para automação de changelog).
Organização: evitar “imports relativos longos”, preferir @/.
Licença
Recomendação: MIT (SPDX: MIT).

O repositório atualmente não define uma licença explícita. Adicione LICENSE na raiz.

Changelog
Recomendação:

Adicionar CHANGELOG.md no estilo “Keep a Changelog”.
Atualizar a cada PR relevante (ou automatizar por release).
Esforço estimado (6–12h) para “documentação completa + OpenAPI”
Estimativa realista (varia conforme maturidade do backend e cobertura dos endpoints):

1–2h: auditoria do código (rotas, chamadas HTTP, auth)
2–4h: README completo + .env.example + CONTRIBUTING + CHANGELOG
2–4h: OpenAPI (paths + schemas + exemplos) baseado no uso real do frontend
1–2h: revisão final, padronização e PR
yaml
Copiar

**Notas técnicas que o README deve refletir (por consistência com o código):**
- `NEXT_PUBLIC_API_URL` é a base principal para as chamadas client-side (`fetch`/`axios`). citeturn51view3turn55view0turn58view0  
- O build ignora ESLint via `next.config.ts`, então lint precisa ser tratado no fluxo de PR/CI. citeturn51view1  
- Admin é protegido por cookie `adminToken` no middleware. citeturn51view2  

## Especificação OpenAPI e Swagger

O frontend chama um conjunto bem definido de endpoints (usuário, carrinho, checkout, admin, configurações e categorias), identificados diretamente no código. A seguir está uma especificação **OpenAPI 3.0** abrangendo **somente os paths observados** nestes arquivos do frontend. citeturn51view3turn50view2turn55view0turn58view0turn52view0turn63view0turn50view0turn50view1

> Observação crítica (cookie do usuário): o nome do cookie de sessão do usuário **não é declarado no frontend**, então a segurança por cookie para endpoints “do usuário” aparece com um nome **placeholder** no schema (ver `userSessionCookie`). Ajuste para o nome real definido no backend. citeturn51view3turn50view2

```yaml
openapi: 3.0.3
info:
  title: Kavita Backend API (observado pelo kavita-frontend)
  version: "0.1.0"
  description: >
    Especificação gerada a partir do uso real do frontend (Next.js).
    Inclui apenas endpoints referenciados no código do repositório.

servers:
  - url: "{API_BASE}"
    variables:
      API_BASE:
        default: "http://localhost:5000"
        description: >
          Base do backend (no frontend: NEXT_PUBLIC_API_URL / API_BASE).
tags:
  - name: Public
  - name: Auth
  - name: Users
  - name: Cart
  - name: Checkout
  - name: Shipping
  - name: AdminAuth
  - name: AdminStats
  - name: AdminReports
  - name: AdminLogs

components:
  securitySchemes:
    adminTokenCookie:
      type: apiKey
      in: cookie
      name: adminToken
      description: >
        Cookie checado pelo middleware do Next para liberar /admin/*.
        Flags (domain/secure/samesite) não são visíveis no frontend.
    userSessionCookie:
      type: apiKey
      in: cookie
      name: userSessionCookie__UNSPECIFIED
      description: >
        PLACEHOLDER — o frontend envia cookies com credentials:include,
        mas NÃO revela o nome do cookie da sessão do usuário.

  schemas:
    ErrorResponse:
      type: object
      properties:
        message:
          type: string
        mensagem:
          type: string
        code:
          type: string
      additionalProperties: true

    AuthUser:
      type: object
      properties:
        id: { type: integer, format: int64 }
        nome: { type: string }
        email: { type: string, format: email }
      required: [id, nome, email]

    LoginRequest:
      type: object
      properties:
        email: { type: string, format: email }
        senha: { type: string }
      required: [email, senha]

    LoginResponse:
      description: >
        O frontend aceita {user} ou o próprio objeto do usuário (data.user ?? data).
        O backend também deve setar cookie de sessão.
      oneOf:
        - type: object
          properties:
            user:
              $ref: "#/components/schemas/AuthUser"
          required: [user]
        - $ref: "#/components/schemas/AuthUser"

    RegisterRequest:
      type: object
      properties:
        nome: { type: string }
        email: { type: string, format: email }
        senha: { type: string }
        cpf: { type: string, description: "Opcional no frontend." }
      required: [nome, email, senha]

    Category:
      type: object
      properties:
        id: { type: integer }
        name: { type: string }
        slug: { type: string }
        is_active:
          oneOf:
            - type: integer
              enum: [0, 1]
            - type: boolean
        sort_order: { type: integer }
        total_products: { type: integer }
      required: [id, name, slug]
      additionalProperties: true

    PublicShopSettings:
      type: object
      properties:
        store_name: { type: string }
        logo_url: { type: string }
        footer_tagline: { type: string }
        contact_whatsapp: { type: string }
        contact_email: { type: string, format: email }
        cnpj: { type: string }
        social_instagram_url: { type: string }
        social_whatsapp_url: { type: string }
        footer_links:
          type: array
          items:
            type: object
            properties:
              label: { type: string }
              href: { type: string }
              highlight: { type: boolean }
        address_city: { type: string }
        address_state: { type: string }
        address_street: { type: string }
        address_neighborhood: { type: string }
        address_zip: { type: string }
        footer:
          type: object
          additionalProperties: true
      required: [store_name, logo_url]
      additionalProperties: true

    CartItemApi:
      type: object
      properties:
        item_id: { type: integer }
        produto_id: { type: integer }
        nome: { type: string }
        valor_unitario:
          oneOf:
            - type: number
            - type: string
        quantidade:
          oneOf:
            - type: integer
            - type: string
        image:
          oneOf:
            - type: string
            - type: "null"
        stock:
          oneOf:
            - type: integer
            - type: string
      required: [produto_id]
      additionalProperties: true

    CartGetResponse:
      type: object
      properties:
        success: { type: boolean }
        carrinho_id:
          oneOf:
            - type: integer
            - type: "null"
        items:
          type: array
          items: { $ref: "#/components/schemas/CartItemApi" }
      additionalProperties: true

    CartItemUpsertRequest:
      type: object
      properties:
        produto_id: { type: integer }
        quantidade: { type: integer }
      required: [produto_id, quantidade]

    CouponPreviewRequest:
      type: object
      properties:
        codigo: { type: string }
        total: { type: number }
      required: [codigo, total]

    CouponPreviewResponse:
      type: object
      properties:
        success: { type: boolean }
        message: { type: string }
        desconto: { type: number }
        total_original: { type: number }
        total_com_desconto: { type: number }
        cupom:
          type: object
          properties:
            id: { type: integer }
            codigo: { type: string }
            tipo: { type: string }
            valor: { type: number }
      required: [success]
      additionalProperties: true

    ShippingQuoteResponse:
      type: object
      properties:
        cep: { type: string }
        price: { type: number }
        prazo_dias: { type: integer }
        ruleApplied:
          type: string
          enum: ["ZONE", "CEP_RANGE", "PRODUCT_FREE"]
      required: [cep, price, prazo_dias]
      additionalProperties: true

    Promotion:
      type: object
      properties:
        id: { type: integer }
        product_id: { type: integer }
        title:
          oneOf:
            - type: string
            - type: "null"
        original_price:
          oneOf:
            - type: number
            - type: string
            - type: "null"
        final_price:
          oneOf:
            - type: number
            - type: string
            - type: "null"
        discount_percent:
          oneOf:
            - type: number
            - type: string
            - type: "null"
        promo_price:
          oneOf:
            - type: number
            - type: string
            - type: "null"
        ends_at:
          oneOf:
            - type: string
            - type: "null"
      additionalProperties: true

    SavedAddress:
      type: object
      properties:
        id: { type: integer }
        apelido:
          oneOf: [{ type: string }, { type: "null" }]
        cep:
          oneOf: [{ type: string }, { type: "null" }]
        endereco:
          oneOf: [{ type: string }, { type: "null" }]
        numero:
          oneOf: [{ type: string }, { type: "null" }]
        bairro:
          oneOf: [{ type: string }, { type: "null" }]
        cidade:
          oneOf: [{ type: string }, { type: "null" }]
        estado:
          oneOf: [{ type: string }, { type: "null" }]
        complemento:
          oneOf: [{ type: string }, { type: "null" }]
        ponto_referencia:
          oneOf: [{ type: string }, { type: "null" }]
        is_default:
          oneOf:
            - type: integer
              enum: [0, 1]
        tipo_localidade:
          oneOf: [{ type: string }, { type: "null" }]
        comunidade:
          oneOf: [{ type: string }, { type: "null" }]
        observacoes_acesso:
          oneOf: [{ type: string }, { type: "null" }]
      required: [id]
      additionalProperties: true

    CheckoutRequest:
      type: object
      properties:
        entrega_tipo:
          type: string
          enum: ["ENTREGA", "RETIRADA"]
        formaPagamento:
          type: string
          description: "Normalizado no frontend (mercadopago|pix|boleto|prazo)."
        produtos:
          type: array
          items:
            type: object
            properties:
              id: { type: integer }
              quantidade: { type: integer }
            required: [id, quantidade]
        total: { type: number }
        nome: { type: string }
        cpf: { type: string, description: "Somente dígitos; frontend valida 11." }
        telefone: { type: string }
        email: { type: string, format: email }
        cupom_codigo:
          type: string
        endereco:
          type: object
          description: "Presente apenas quando entrega_tipo=ENTREGA."
          additionalProperties: true
      required: [entrega_tipo, formaPagamento, produtos, total, nome, cpf, telefone, email]
      additionalProperties: true

    CheckoutResponse:
      type: object
      properties:
        pedido_id: { type: integer }
        nota_fiscal_aviso: { type: string }
      required: [pedido_id]
      additionalProperties: true

    PaymentStartRequest:
      type: object
      properties:
        pedidoId: { type: integer }
      required: [pedidoId]

    PaymentStartResponse:
      type: object
      properties:
        init_point: { type: string }
        sandbox_init_point: { type: string }
      additionalProperties: true

    AdminLoginResponse:
      type: object
      properties:
        token: { type: string, description: "Retornado, mas o frontend não usa." }
        message: { type: string }
        admin:
          type: object
          properties:
            id: { type: integer }
            email: { type: string, format: email }
            nome: { type: string }
            role: { type: string }
            permissions:
              type: array
              items: { type: string }
          required: [id, email, nome, role]
      required: [admin]
      additionalProperties: true

    AdminMeResponse:
      type: object
      properties:
        id: { type: integer }
        nome: { type: string }
        email: { type: string, format: email }
        role: { type: string }
        role_id:
          oneOf: [{ type: integer }, { type: "null" }]
        permissions:
          type: array
          items: { type: string }
      required: [id, nome, email, role, permissions]
      additionalProperties: true

    AdminResumo:
      type: object
      properties:
        totalProdutos: { type: integer }
        totalPedidosUltimos30: { type: integer }
        totalClientes: { type: integer }
        totalDestaques: { type: integer }
        totalServicos: { type: integer }
        totalVendas30Dias: { type: number }
        ticketMedio: { type: number }
      required:
        - totalProdutos
        - totalPedidosUltimos30
        - totalClientes
        - totalDestaques
        - totalServicos
        - totalVendas30Dias
        - ticketMedio

    AdminVendasResponse:
      type: object
      properties:
        rangeDays: { type: integer }
        points:
          type: array
          items:
            type: object
            properties:
              date: { type: string, description: "YYYY-MM-DD" }
              total: { type: number }
            required: [date, total]
      required: [rangeDays, points]

    AdminLog:
      type: object
      properties:
        id: { type: integer }
        admin_nome: { type: string }
        acao: { type: string }
        detalhes:
          oneOf: [{ type: string }, { type: "null" }]
        criado_em: { type: string }
      required: [id, admin_nome, acao, criado_em]
      additionalProperties: true

    AdminAlert:
      type: object
      properties:
        id: { type: string }
        nivel: { type: string, enum: ["info", "warning", "danger"] }
        tipo: { type: string, enum: ["pagamento", "estoque", "carrinhos", "sistema", "outro"] }
        titulo: { type: string }
        mensagem: { type: string }
        link:
          oneOf: [{ type: string }, { type: "null" }]
        link_label:
          oneOf: [{ type: string }, { type: "null" }]
      required: [id, nivel, tipo, titulo, mensagem]
      additionalProperties: true

paths:
  /api/config:
    get:
      tags: [Public]
      summary: Configuração pública da loja
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema: { $ref: "#/components/schemas/PublicShopSettings" }
              examples:
                example:
                  value:
                    store_name: "Kavita"
                    logo_url: "/uploads/logo.png"
        "5XX":
          description: Erro do servidor
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ErrorResponse" }

  /api/public/categorias:
    get:
      tags: [Public]
      summary: Categorias públicas (PT)
      responses:
        "200":
          description: Lista de categorias
          content:
            application/json:
              schema:
                type: array
                items: { $ref: "#/components/schemas/Category" }

  /api/public/categories:
    get:
      tags: [Public]
      summary: Categorias públicas (EN)
      responses:
        "200":
          description: Lista de categorias
          content:
            application/json:
              schema:
                type: array
                items: { $ref: "#/components/schemas/Category" }

  /api/categorias:
    get:
      tags: [Public]
      summary: Categorias (PT)
      responses:
        "200":
          description: Lista de categorias
          content:
            application/json:
              schema:
                type: array
                items: { $ref: "#/components/schemas/Category" }

  /api/categories:
    get:
      tags: [Public]
      summary: Categorias (EN)
      responses:
        "200":
          description: Lista de categorias
          content:
            application/json:
              schema:
                type: array
                items: { $ref: "#/components/schemas/Category" }

  /api/login:
    post:
      tags: [Auth]
      summary: Login de usuário (cliente)
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/LoginRequest" }
            examples:
              example:
                value: { email: "cliente@exemplo.com", senha: "minhaSenha" }
      responses:
        "200":
          description: OK (e cookie de sessão setado pelo backend)
          headers:
            Set-Cookie:
              description: Cookie de sessão do usuário (nome/flags dependem do backend)
              schema: { type: string }
          content:
            application/json:
              schema: { $ref: "#/components/schemas/LoginResponse" }
        "401":
          description: Credenciais inválidas
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ErrorResponse" }

  /api/logout:
    post:
      tags: [Auth]
      summary: Logout de usuário (cliente)
      security:
        - userSessionCookie: []
      responses:
        "200":
          description: OK (backend deve invalidar cookie)
          content:
            application/json:
              schema: { type: object, additionalProperties: true }
        "401":
          description: Não autenticado
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ErrorResponse" }

  /api/users/me:
    get:
      tags: [Users]
      summary: Retorna o usuário autenticado (cliente)
      security:
        - userSessionCookie: []
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema: { $ref: "#/components/schemas/AuthUser" }
        "401":
          description: Não autenticado
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ErrorResponse" }

  /api/users/register:
    post:
      tags: [Users]
      summary: Registro de usuário (cliente)
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/RegisterRequest" }
      responses:
        "200":
          description: OK (backend pode ou não autenticar automaticamente)
          content:
            application/json:
              schema: { type: object, additionalProperties: true }
        "400":
          description: Dados inválidos
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ErrorResponse" }

  /api/users/addresses:
    get:
      tags: [Users]
      summary: Lista endereços salvos do usuário
      security:
        - userSessionCookie: []
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                type: array
                items: { $ref: "#/components/schemas/SavedAddress" }
        "401":
          description: Não autenticado
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ErrorResponse" }

  /api/cart:
    get:
      tags: [Cart]
      summary: Carrinho do usuário autenticado
      security:
        - userSessionCookie: []
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema: { $ref: "#/components/schemas/CartGetResponse" }
        "401":
          description: Não autenticado
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ErrorResponse" }
    delete:
      tags: [Cart]
      summary: Limpa o carrinho
      security:
        - userSessionCookie: []
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema: { type: object, additionalProperties: true }

  /api/cart/items:
    post:
      tags: [Cart]
      summary: Adiciona item ao carrinho (server-side)
      security:
        - userSessionCookie: []
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/CartItemUpsertRequest" }
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema: { type: object, additionalProperties: true }
        "409":
          description: Conflito (ex.: STOCK_LIMIT)
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ErrorResponse" }
    patch:
      tags: [Cart]
      summary: Atualiza quantidade de item no carrinho (server-side)
      security:
        - userSessionCookie: []
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/CartItemUpsertRequest" }
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema: { type: object, additionalProperties: true }
        "409":
          description: Conflito (ex.: STOCK_LIMIT)
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ErrorResponse" }

  /api/cart/items/{produtoId}:
    delete:
      tags: [Cart]
      summary: Remove item do carrinho
      security:
        - userSessionCookie: []
      parameters:
        - in: path
          name: produtoId
          required: true
          schema: { type: integer }
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema: { type: object, additionalProperties: true }

  /api/public/promocoes/{productId}:
    get:
      tags: [Public]
      summary: Promoção ativa de um produto (se existir)
      parameters:
        - in: path
          name: productId
          required: true
          schema: { type: integer }
      responses:
        "200":
          description: Promoção retornada
          content:
            application/json:
              schema: { $ref: "#/components/schemas/Promotion" }
        "404":
          description: Sem promoção ativa
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ErrorResponse" }

  /api/shipping/quote:
    get:
      tags: [Shipping]
      summary: Cotação de frete por CEP e itens
      parameters:
        - in: query
          name: cep
          required: true
          schema: { type: string, example: "12345678" }
        - in: query
          name: items
          required: true
          schema:
            type: string
            description: >
              JSON string com itens [{id, quantidade}]. O frontend envia via querystring.
      security:
        - userSessionCookie: []
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ShippingQuoteResponse" }
        "404":
          description: CEP sem cobertura
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ErrorResponse" }

  /api/checkout/preview-cupom:
    post:
      tags: [Checkout]
      summary: Prévia/aplicação de cupom (cálculo de desconto)
      security:
        - userSessionCookie: []
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/CouponPreviewRequest" }
      responses:
        "200":
          description: OK (success true/false no payload)
          content:
            application/json:
              schema: { $ref: "#/components/schemas/CouponPreviewResponse" }
        "401":
          description: Não autenticado
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ErrorResponse" }

  /api/checkout:
    post:
      tags: [Checkout]
      summary: Cria pedido a partir do checkout
      security:
        - userSessionCookie: []
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/CheckoutRequest" }
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema: { $ref: "#/components/schemas/CheckoutResponse" }
        "400":
          description: Validação (ex.: dados incompletos)
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ErrorResponse" }
        "401":
          description: Não autenticado
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ErrorResponse" }

  /api/payment/start:
    post:
      tags: [Checkout]
      summary: Inicia pagamento (retorna init_point/sandbox_init_point)
      security:
        - userSessionCookie: []
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/PaymentStartRequest" }
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema: { $ref: "#/components/schemas/PaymentStartResponse" }

  /api/admin/login:
    post:
      tags: [AdminAuth]
      summary: Login de administrador
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/LoginRequest" }
      responses:
        "200":
          description: OK (cookie adminToken setado pelo backend)
          headers:
            Set-Cookie:
              schema: { type: string }
          content:
            application/json:
              schema: { $ref: "#/components/schemas/AdminLoginResponse" }
        "401":
          description: Credenciais inválidas
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ErrorResponse" }

  /api/admin/logout:
    post:
      tags: [AdminAuth]
      summary: Logout de administrador
      security:
        - adminTokenCookie: []
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema: { type: object, additionalProperties: true }

  /api/admin/me:
    get:
      tags: [AdminAuth]
      summary: Retorna admin autenticado (role, permissions)
      security:
        - adminTokenCookie: []
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema: { $ref: "#/components/schemas/AdminMeResponse" }
        "401":
          description: Não autenticado

  /api/admin/stats/resumo:
    get:
      tags: [AdminStats]
      summary: KPIs do dashboard (resumo)
      security:
        - adminTokenCookie: []
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema: { $ref: "#/components/schemas/AdminResumo" }
        "401":
          description: Não autenticado

  /api/admin/stats/vendas:
    get:
      tags: [AdminStats]
      summary: Série de vendas (ex.: range=7)
      security:
        - adminTokenCookie: []
      parameters:
        - in: query
          name: range
          required: true
          schema: { type: integer, example: 7 }
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema: { $ref: "#/components/schemas/AdminVendasResponse" }

  /api/admin/logs:
    get:
      tags: [AdminLogs]
      summary: Logs/auditoria (atividade recente)
      security:
        - adminTokenCookie: []
      parameters:
        - in: query
          name: limit
          required: false
          schema: { type: integer, example: 20 }
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                type: array
                items: { $ref: "#/components/schemas/AdminLog" }

  /api/admin/stats/alertas:
    get:
      tags: [AdminStats]
      summary: Alertas do dashboard
      security:
        - adminTokenCookie: []
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                type: array
                items: { $ref: "#/components/schemas/AdminAlert" }
        "404":
          description: Endpoint não existente no backend (frontend tolera 404)

  /api/admin/relatorios/clientes-top:
    get:
      tags: [AdminReports]
      summary: Relatório - top clientes
      security:
        - adminTokenCookie: []
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                type: object
                properties:
                  rows:
                    type: array
                    items:
                      type: object
                      properties:
                        id: { type: integer }
                        nome: { type: string }
                        pedidos: { type: number }
                        total_gasto: { type: number }
                additionalProperties: true

  /api/admin/stats/produtos-mais-vendidos:
    get:
      tags: [AdminStats]
      summary: Top produtos mais vendidos (limit=5)
      security:
        - adminTokenCookie: []
      parameters:
        - in: query
          name: limit
          required: false
          schema: { type: integer, example: 5 }
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                type: array
                items:
                  type: object
                  properties:
                    id: { type: integer }
                    name: { type: string }
                    quantidadeVendida: { type: number }
                    totalVendido: { type: number }
                  additionalProperties: true

  /api/admin/relatorios/servicos-ranking:
    get:
      tags: [AdminReports]
      summary: Relatório - ranking de serviços
      security:
        - adminTokenCookie: []
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                type: object
                properties:
                  rows:
                    type: array
                    items:
                      type: object
                      properties:
                        id: { type: integer }
                        nome: { type: string }
                        total_servicos: { type: number }
                        rating_avg: { type: number }
                additionalProperties: true
Mapa de rotas do frontend para endpoints e fluxo de autenticação
Mapeamento (arquivo/componente → método → path → propósito)
Os endpoints abaixo foram coletados diretamente das chamadas no código-fonte (incluindo hooks/contextos e páginas). 

Frontend (arquivo)	Método HTTP	Path	Propósito/uso observado
src/lib/api.ts	(wrapper)	{BASE}{path}	Helper que injeta Content-Type: application/json e credentials: include e normaliza erros. 
src/context/AuthContext.tsx	GET	/api/users/me	Carregar/atualizar usuário logado pelo cookie (refresh inicial). 
src/context/AuthContext.tsx	POST	/api/login	Login do usuário; o backend deve setar cookie; frontend lê data.user ou data. 
src/context/AuthContext.tsx	POST	/api/users/register	Registro de usuário (payload inclui cpf?). 
src/context/AuthContext.tsx	POST	/api/logout	Logout do usuário (frontend faz “best-effort”, zera estado). 
src/context/CartContext.tsx	GET	/api/cart	Buscar carrinho do usuário autenticado (fonte da verdade no modo logado). 
src/context/CartContext.tsx	POST	/api/cart/items	Adicionar item ao carrinho no backend. (Trata 409 STOCK_LIMIT). 
src/context/CartContext.tsx	PATCH	/api/cart/items	Atualizar quantidade no backend. (Trata 409 STOCK_LIMIT). 
src/context/CartContext.tsx	DELETE	/api/cart/items/{id}	Remover item do carrinho no backend. 
src/context/CartContext.tsx	DELETE	/api/cart	Limpar carrinho no backend. 
src/server/data/categories.ts	GET	/api/public/categorias	Buscar categorias públicas (primeira tentativa). 
src/server/data/categories.ts	GET	/api/categorias	Fallback de rota de categorias. 
src/server/data/categories.ts	GET	/api/public/categories	Fallback EN. 
src/server/data/categories.ts	GET	/api/categories	Fallback EN. 
src/server/data/shopSettings.ts	GET	/api/config	Config pública da loja (sem cache). 
src/app/checkout/page.tsx	GET	/api/public/promocoes/{id}	Buscar promoções por produto do carrinho (tolerando 404). 
src/app/checkout/page.tsx	POST	/api/checkout/preview-cupom	Validar/aplicar cupom e obter desconto antes do checkout. 
src/app/checkout/page.tsx	GET	/api/users/addresses	Endereços salvos do usuário (checkout). 
src/app/checkout/page.tsx	GET	/api/shipping/quote	Cotar frete (passa cep + items como JSON em query). 
src/app/checkout/page.tsx	POST	/api/checkout	Criar pedido (ENTREGA ou RETIRADA), com payload normalizado. 
src/app/checkout/page.tsx	POST	/api/payment/start	Iniciar pagamento e redirecionar para init_point/sandbox_init_point. 
src/app/admin/login/page.tsx	POST	/api/admin/logout	Ao abrir login do admin, tenta encerrar sessão anterior. 
src/app/admin/login/page.tsx	POST	/api/admin/login	Login do admin (recebe cookie HttpOnly do backend). 
src/context/AdminAuthContext.tsx	GET	/api/admin/me	Sincroniza sessão admin real (role/permissões) via cookie. 
src/context/AdminAuthContext.tsx	POST	/api/admin/logout	Logout do admin (limpa cookie no backend e estado/localStorage). 
src/app/admin/page.tsx	GET	/api/admin/stats/resumo	KPIs do painel admin. 
src/app/admin/page.tsx	GET	/api/admin/stats/vendas?range=7	Série para gráfico de vendas. 
src/app/admin/page.tsx	GET	/api/admin/logs?limit=20	Atividade recente / auditoria. 
src/app/admin/page.tsx	GET	/api/admin/relatorios/clientes-top	Top clientes (retorno rows). 
src/app/admin/page.tsx	GET	/api/admin/stats/produtos-mais-vendidos?limit=5	Top produtos vendidos. 
src/app/admin/page.tsx	GET	/api/admin/relatorios/servicos-ranking	Ranking serviços. 
src/app/admin/page.tsx	GET	/api/admin/stats/alertas	Alertas do painel (frontend tolera 404). 

Cookies e flags (o que o frontend permite concluir)
Admin

Cookie nomeado: adminToken (checado no middleware). 
O login do admin usa credentials: "include" e há comentário indicando que o cookie é HttpOnly e setado pelo backend (o frontend não grava token em JS). 
domain, secure, sameSite: não identificáveis pelo frontend (dependem do backend / infra).
Usuário

Cookie: nome não especificado no frontend. O frontend apenas envia cookies ao backend (credentials: "include"). 
domain, secure, httpOnly, sameSite: não identificáveis a partir deste repo.
Diagrama de autenticação (usuário e admin)
mermaid
Copiar
sequenceDiagram
  autonumber
  participant U as Usuário
  participant FE as Frontend (Next.js)
  participant BE as Backend API

  rect rgba(33, 150, 243, 0.08)
  note over U,BE: Login do usuário (cliente)
  U->>FE: Acessa /login
  FE->>BE: POST /api/login (credentials: include)
  BE-->>FE: 200 + Set-Cookie (sessão do usuário; nome não explicitado no FE)
  FE->>BE: GET /api/users/me (credentials: include)
  BE-->>FE: 200 {id,nome,email}
  FE-->>U: Sessão ativa no app
  end

  rect rgba(76, 175, 80, 0.08)
  note over U,BE: Login do administrador (/admin)
  U->>FE: Acessa /admin/login
  FE->>BE: POST /api/admin/login (credentials: include)
  BE-->>FE: 200 + Set-Cookie (adminToken)
  FE->>BE: GET /api/admin/me (credentials: include)
  BE-->>FE: 200 {role, permissions, ...}
  FE-->>U: Acesso liberado ao painel /admin/*
  end

  rect rgba(244, 67, 54, 0.08)
  note over U,BE: Logout (usuário/admin)
  U->>FE: Aciona logout
  FE->>BE: POST /api/logout ou POST /api/admin/logout
  BE-->>FE: 200 (cookie invalidado)
  FE-->>U: Estado local limpo e redirecionamento
  end
Diagrama do fluxo de checkout (alto nível)
mermaid
Copiar
flowchart TD
  A[Carrinho local] --> B{Usuário logado?}
  B -- não --> L[/login/]
  B -- sim --> C[GET /api/cart (sincroniza)]
  C --> D[GET /api/public/promocoes/{id} (por item)]
  D --> E{Entrega ou Retirada}
  E -- Retirada --> F[Sem frete]
  E -- Entrega --> G[GET /api/shipping/quote?cep&items]
  G --> H[POST /api/checkout/preview-cupom (opcional)]
  F --> I[POST /api/checkout]
  H --> I[POST /api/checkout]
  I --> J{formaPagamento gateway?}
  J -- pix/boleto/mercadopago --> K[POST /api/payment/start -> init_point]
  K --> M[Redirect para gateway]
  J -- prazo/outro --> N[Confirmação local + clearCart]
Arquivos a adicionar/alterar, snippets e checklist de PR/release
Arquivos recomendados
Com base no estado atual do repo (README detalhado, mas sem documentação operacional e sem OpenAPI versionado), a entrega “completa” tende a incluir os seguintes arquivos. 

Modificar

README.md (substituir pelo draft acima; corrigir especialmente autenticação de usuário vs admin). 
Adicionar

.env.example (para padronizar setup de dev/prod e reduzir onboarding).
docs/openapi.yaml (a especificação acima).
LICENSE (recomendação: MIT — SPDX: MIT).
CHANGELOG.md (modelo inicial).
CONTRIBUTING.md (checklist e convenções).
Snippets/templates exatos
.env.example

bash
Copiar
# Backend base URL
NEXT_PUBLIC_API_URL=http://localhost:5000

# Opcional (usado em fallbacks em código server-side)
API_BASE=http://localhost:5000
NEXT_PUBLIC_API_BASE=http://localhost:5000
(As variáveis acima aparecem como base/fallback no código de chamadas ao backend.) 

docs/openapi.yaml

Use exatamente o YAML da seção “Especificação OpenAPI e Swagger”.
CHANGELOG.md (sugestão de estrutura)

md
Copiar
# Changelog

## Unreleased
- Added:
- Changed:
- Fixed:
- Security:

## 0.1.0
- Initial documented release.
CONTRIBUTING.md (mínimo funcional)

md
Copiar
# Contribuindo

## Setup
1. `npm ci`
2. Copie `.env.example` -> `.env.local`

## Antes do PR
- `npm run lint`
- `npm run test:run`
- `npm run build`

## Padrões
- TypeScript estrito
- Preferir imports `@/` (alias do tsconfig)
- Evitar lógica de autorização apenas no client (admin depende de cookie + backend)

## Segurança
- Não registrar tokens/cookies em logs
- Não persistir tokens em localStorage (admin já segue isso)
(O alias @/ é definido no tsconfig.json.) 

LICENSE (recomendação: MIT; SPDX MIT)

text
Copiar
MIT License

Copyright (c) <ANO> <TITULAR>

Permission is hereby granted, free of charge, to any person obtaining a copy...
Preencher <ANO> e <TITULAR> corretamente (não inferível pelo repo).

Checklist de PR review
Baseado no que o código realmente faz (cookies, endpoints, e riscos comuns), um checklist objetivo para PR:

Build & qualidade

npm run build passa (atenção: ESLint é ignorado no build). 
npm run lint passa. 
npm run test:run (e idealmente test:coverage) passa. 
Autenticação e segurança

Nenhum PR adiciona token (admin ou user) em localStorage/logs por conveniência.
Admin continua dependendo de cookie adminToken (middleware) e credentials: include. 
Endpoint changes: se alterar /api/*, atualizar docs/openapi.yaml e o mapa de rotas. 
Compatibilidade backend

Mudanças em payload de checkout mantêm compatibilidade com entrega/retirada e campos rurais/urbanos. 
Carrinho continua tratando 409 STOCK_LIMIT sem quebrar UX. 
Docs

README atualizado se scripts/env/endpoints mudaram. 
