# 🐮 Kavita Backend - API RESTful para E-commerce Agropecuário

Este é o backend da aplicação **Kavita**, um sistema completo de e-commerce voltado para produtos e serviços agropecuários. Essa API foi construída com Node.js, Express, MySQL e autenticação JWT.

---

## 🚀 Tecnologias Utilizadas

- **Node.js + Express**: servidor e rotas
- **MySQL**: banco de dados relacional
- **JWT**: autenticação de administradores
- **bcrypt**: criptografia de senhas
- **dotenv**: variáveis de ambiente
- **nodemailer**: envio de e-mails (recuperação de senha)

---

## 📂 Estrutura de Pastas

```
.
├── config/
│   └── pool.js            # Conexão com o banco de dados
├── controllers/           # Lógica de autenticação e recuperação de senha
├── middleware/
│   └── verifyAdmin.js     # Proteção de rotas administrativas via token
├── routes/
│   ├── admin*.js          # Todas as rotas privadas de administração
│   ├── public*.js         # Rotas públicas (serviços, destaques)
│   ├── checkoutRoutes.js  # Finalização de pedidos
│   └── users.js           # Cadastro, login, recuperação de senha
├── mailService.js         # Serviço de envio de e-mails via Gmail
├── server.js              # Entrada principal da aplicação
└── .env                   # Variáveis sensíveis (NUNCA subir para o GitHub)
```

---

## 🗺️ Mapa das Rotas

A API monta todas as rotas a partir de `routes/index.js`, que agrega módulos especializados. Os caminhos abaixo já incluem o prefixo `/api` definido no `server.js`:

- **Produtos**: `/products` (listagem e filtros) e `/products/:id` (detalhe).
- **Catálogo público**: `/public/categorias`, `/public/destaques`, `/public/produtos` (busca) e `/public/servicos` (lista, avaliações e solicitações).
- **Autenticação e usuários**: `/login`, `/users` (cadastro/reset de senha), `/users/addresses`, `/users/profile` e `/favorites`.
- **Carrinho e pedidos**: `/cart`, `/checkout`, `/payment`, `/pedidos`.
- **Administração**: `/admin` e subrotas para produtos, categorias, serviços, pedidos, cupons, relatórios, comunicação e configurações.

---

## 🔐 Autenticação

- **Admins** fazem login em `/api/admin/login` e recebem um token JWT
- Esse token deve ser enviado no `Authorization` header como: `Bearer <token>`
- Usuários comuns usam `/api/login` para autenticação simples (sem token por enquanto)

---

## 🛠️ Rotas Administrativas (protegidas por token)

| Método | Rota | Descrição |
|--------|------|-----------|
| POST   | /api/admin/login | Login do administrador |
| GET    | /api/admin/categorias | Lista categorias |
| GET    | /api/admin/produtos | Lista produtos com paginação |
| POST   | /api/admin/produtos | Cria produto com imagens |
| PUT    | /api/admin/produtos/:id | Atualiza produto e imagens |
| DELETE | /api/admin/produtos/:id | Remove produto |
| GET    | /api/admin/servicos | Lista serviços (com mídias) |
| POST   | /api/admin/servicos | Cria serviço com imagens |
| PUT    | /api/admin/servicos/:id | Atualiza serviço |
| DELETE | /api/admin/servicos/:id | Remove serviço |
| PATCH  | /api/admin/servicos/:id/verificado | Marca serviço como verificado |
| GET    | /api/admin/servicos/solicitacoes | Lista solicitações de serviço recebidas |
| PATCH  | /api/admin/servicos/solicitacoes/:id/status | Atualiza status da solicitação |
| GET    | /api/admin/destaques | Lista destaques |
| POST   | /api/admin/destaques | Adiciona destaque |
| DELETE | /api/admin/destaques/:id | Remove destaque |
| POST   | /api/admin/colaboradores | Cadastra colaborador verificado |
| GET    | /api/admin/colaboradores/pending | Lista cadastros pendentes |
| PUT    | /api/admin/colaboradores/:id/verify | Aprova colaborador |
| DELETE | /api/admin/colaboradores/:id | Remove colaborador |
| GET    | /api/admin/especialidades | Lista especialidades (para gestão) |
| GET    | /api/admin/especialidades/public | Lista especialidades (uso público) |
| GET    | /api/admin/pedidos | Lista pedidos |
| GET    | /api/admin/pedidos/:id | Detalha pedido |
| PUT    | /api/admin/pedidos/:id/pagamento | Atualiza status de pagamento |
| PUT    | /api/admin/pedidos/:id/entrega | Atualiza status de entrega |
| GET    | /api/admin/carrinhos | Lista carrinhos ativos |
| POST   | /api/admin/carrinhos/:id/notificar | Dispara aviso de carrinho abandonado |
| GET    | /api/admin/users | Lista usuários |
| PUT    | /api/admin/users/:id/block | Bloqueia/desbloqueia usuário |
| DELETE | /api/admin/users/:id | Remove usuário |
| GET    | /api/admin/cupons | Lista cupons |
| POST   | /api/admin/cupons | Cria cupom |
| PUT    | /api/admin/cupons/:id | Atualiza cupom |
| DELETE | /api/admin/cupons/:id | Exclui cupom |
| GET    | /api/admin/comunicacao/templates | Lista templates de comunicação |
| POST   | /api/admin/comunicacao/email | Envia campanha por e-mail |
| POST   | /api/admin/comunicacao/whatsapp | Envia campanha por WhatsApp |
| GET    | /api/admin/config | Lê configurações gerais |
| PUT    | /api/admin/config | Atualiza configurações gerais |
| GET    | /api/admin/config/categories | Lista configurações de categorias |
| POST   | /api/admin/config/categories | Cria configuração de categoria |
| PUT    | /api/admin/config/categories/:id | Atualiza configuração de categoria |
| GET    | /api/admin/stats/resumo | Indicadores gerais de vendas |
| GET    | /api/admin/stats/vendas | Curva de vendas |
| GET    | /api/admin/stats/produtos-mais-vendidos | Ranking de produtos |
| GET    | /api/admin/relatorios/vendas | Relatório detalhado de vendas |
| GET    | /api/admin/relatorios/produtos-mais-vendidos | Relatório de produtos |
| GET    | /api/admin/relatorios/clientes-top | Top clientes |
| GET    | /api/admin/relatorios/estoque | Níveis de estoque |
| GET    | /api/admin/relatorios/estoque-baixo | Alertas de estoque baixo |
| GET    | /api/admin/relatorios/servicos | Relatório de serviços |
| GET    | /api/admin/relatorios/servicos-ranking | Ranking de serviços |

---

## 🌐 Rotas Públicas (acessíveis sem autenticação)

| Método | Rota | Descrição |
|--------|------|-----------|
| GET    | /api/products | Lista paginada de produtos (filtros: categoria, busca, ordenação) |
| GET    | /api/products/:id | Detalha produto e imagens |
| GET    | /api/public/categorias | Lista categorias para navegação |
| GET    | /api/public/destaques | Lista destaques publicados |
| GET    | /api/public/produtos | Busca dinâmica de produtos |
| GET    | /api/public/servicos | Lista serviços e colaboradores |
| GET    | /api/public/servicos/:id | Detalha serviço específico |
| POST   | /api/public/servicos/solicitacoes | Abre solicitação de serviço |
| POST   | /api/public/servicos/avaliacoes | Avalia colaborador/serviço |
| GET    | /api/public/servicos/:id/avaliacoes | Lista avaliações do serviço |
| POST   | /api/public/servicos/:id/view | Registra visualização do perfil |
| POST   | /api/public/servicos/:id/whatsapp | Gera link de contato via WhatsApp |
| POST   | /api/public/servicos/trabalhe-conosco | Envia candidatura de colaborador |
| POST   | /api/admin/colaboradores/public | Cadastra colaborador via formulário público |
| GET    | /api/admin/especialidades/public | Lista especialidades para formulário público |

---

## 👤 Autenticação de Usuário (cliente final)

| Método | Rota              | Descrição                            |
|--------|-------------------|---------------------------------------|
| POST   | /api/login        | Login do usuário comum                |
| POST   | /api/users/register | Cadastro de novo usuário            |
| POST   | /api/users/forgot-password | Solicita link de redefinição  |
| POST   | /api/users/reset-password  | Redefine senha com token       |

---

## 💳 Checkout

| Método | Rota          | Descrição                                |
|--------|---------------|-------------------------------------------|
| POST   | /api/checkout | Finaliza pedido (salva dados e itens)     |
| POST   | /api/checkout/preview-cupom | Valida cupom antes do checkout |

---

## 📄 Documentação automática (Swagger)

Os módulos de rotas já trazem anotações `@openapi` (ex.: `routes/products.js`), o que permite gerar documentação interativa. Para automatizar, você pode integrar [swagger-jsdoc](https://github.com/Surnet/swagger-jsdoc) + [swagger-ui-express](https://github.com/scottie1984/swagger-ui-express) no `server.js`, apontando para os arquivos de rotas, e então expor um endpoint como `/api/docs` referenciado aqui no README.

---



## 📬 Envio de E-mail

A API usa `nodemailer` com Gmail para envio de link de redefinição de senha:
- Endereço de envio: `EMAIL_USER`
- Token de redefinição tem validade de 1 hora
- Rota: `POST /api/users/forgot-password`

---

## 📌 Requisitos para rodar o projeto

1. Node.js instalado
2. MySQL rodando e banco `kavita` criado
3. Arquivo `.env` configurado com dados corretos

---

## ▶️ Executar localmente

```bash
npm install
node server.js
```

Servidor será iniciado em `http://localhost:5000`

---

## ✉️ Contato

Se você tiver dúvidas ou quiser contribuir, entre em contato:
- Email: suporte@kavita.com

---

Desenvolvido com ❤️ para gestão de produtos agropecuários.
