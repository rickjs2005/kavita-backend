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

## 🔐 Autenticação

- **Admins** fazem login em `/api/admin/login` e recebem um token JWT
- Esse token deve ser enviado no `Authorization` header como: `Bearer <token>`
- Usuários comuns usam `/api/login` para autenticação simples (sem token por enquanto)

---

## 🛠️ Rotas Administrativas (protegidas por token)

| Método | Rota                           | Descrição                             |
|--------|--------------------------------|----------------------------------------|
| POST   | /api/admin/login              | Login do administrador                 |
| GET    | /api/admin/produtos           | Lista todos os produtos                |
| POST   | /api/admin/produtos           | Cadastra novo produto                  |
| PUT    | /api/admin/produtos/:id       | Atualiza produto por ID                |
| DELETE | /api/admin/produtos/:id       | Remove produto                         |
| GET    | /api/admin/categorias         | Lista categorias                       |
| GET    | /api/admin/servicos           | Lista colaboradores com especialidades |
| POST   | /api/admin/colaboradores      | Cadastra novo colaborador              |
| DELETE | /api/admin/colaboradores/:id  | Remove colaborador                     |
| GET    | /api/admin/especialidades     | Lista especialidades                   |
| GET    | /api/admin/destaques          | Lista produtos em destaque             |
| POST   | /api/admin/destaques          | Adiciona destaque                      |
| DELETE | /api/admin/destaques/:id      | Remove destaque                        |
| GET    | /api/admin/pedidos            | Lista todos os pedidos com itens       |
| PUT    | /api/admin/pedidos/:id/status | Atualiza status do pedido              |
| PUT    | /api/admin/pedidos/:id/endereco | Atualiza endereço do pedido         |
| PUT    | /api/admin/pedidos/:id/itens  | Substitui itens do pedido              |

---

## 🌐 Rotas Públicas (acessíveis sem autenticação)

| Método | Rota                            | Descrição                              |
|--------|---------------------------------|-----------------------------------------|
| GET    | /api/products?category=xxx     | Lista produtos por categoria            |
| GET    | /api/products/:id              | Detalhes de produto por ID              |
| GET    | /api/public/servicos           | Lista de serviços e colaboradores       |
| GET    | /api/public/destaques          | Lista de produtos em destaque           |
| GET    | /api/public/produtos?busca=xxx | Busca dinâmica de produtos (search bar) |

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
