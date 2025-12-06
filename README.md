Kavita Backend

Este repositório contém a API do Kavita, um projeto de e‑commerce voltado à venda de produtos e serviços.
O backend foi construído com Node.js e Express, utiliza MySQL como banco de dados relacional e implementa autenticação via JWT para administração e usuários.

Principais funcionalidades

Produtos e serviços: cadastro e consulta pública de produtos, categorias, serviços e promoções.

Carrinho de compras: criação, adição, atualização e remoção de itens do carrinho para usuários autenticados.

Pedidos e checkout: cálculo de total, aplicação de cupons, registro de pagamento e acompanhamento de status de pedidos.

Gerenciamento de usuários: registro, login (gerando token JWT), recuperação de senha, perfis de usuário e endereços.

Área administrativa: painel completo para gerenciar produtos, serviços, pedidos, cupons, usuários, cargos/permissões e administradores.

Documentação Swagger: todas as rotas estão documentadas e podem ser visualizadas em /docs.

Segurança: proteção CORS configurável, rate limiter adaptativo, hashes de senha com bcrypt e acesso restrito via JWT.

Requisitos

Node.js 16 ou superior

MySQL 5.7 ou superior

Variáveis de ambiente definidas (conforme config/env.js):

JWT_SECRET: segredo usado para assinar tokens JWT

EMAIL_USER / EMAIL_PASS: credenciais para envio de e‑mails via SMTP

APP_URL: URL pública do frontend (usada em links de e‑mail)

BACKEND_URL: URL pública do backend

DB_HOST, DB_USER, DB_PASSWORD, DB_NAME: dados de conexão com o banco

Opcional:

DB_PORT: porta do MySQL (padrão 3306)

DISABLE_NOTIFICATIONS: se definido como true, o serviço de notificações (WhatsApp/e‑mail) entra em modo mock e apenas faz console.log

Instalação

Clone o repositório

git clone https://github.com/rickjs2005/kavita-backend.git
cd kavita-backend


Instale as dependências

npm install


Configure o banco de dados

Crie um banco de dados MySQL e ajuste as variáveis de ambiente (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME).

Execute os scripts SQL correspondentes para criar as tabelas necessárias (pode ser fornecido em outro diretório ou migrado manualmente).

Crie um arquivo .env com todas as variáveis obrigatórias mencionadas em config/env.js.

Inicie a aplicação

npm start


A API iniciará na porta definida em PORT (padrão 5000).
A documentação Swagger estará disponível em http://localhost:5000/docs.

Estrutura de pastas
├── controllers      # Lógica dos controllers (auth, relatórios, etc.)
├── routes           # Definição das rotas públicas e privadas
│   ├── admin        # Rotas exclusivas do painel de administração
│   ├── public       # Rotas públicas (produtos, serviços, promoções)
│   └── ...
├── middleware       # Middlewares de autenticação, CORS, rate limiter, etc.
├── services         # Serviços de e‑mail, notificações e tokens
├── utils            # Funções auxiliares (validação de CPF, etc.)
├── docs             # Configuração do Swagger
├── config           # Configurações de ambiente e de conexão
├── server.js        # Ponto de entrada principal
└── package.json

Uso da API

Abaixo está um resumo de alguns endpoints importantes (todos documentados via Swagger):

Autenticação

POST /api/users – Registro de novo usuário.

POST /api/login – Login do usuário. Retorna um token JWT para autenticação subsequente.

POST /api/forgot-password / POST /api/reset-password – Fluxo de recuperação de senha.

Produtos e serviços (público)

GET /api/products – Lista produtos com paginação e ordenação.

GET /api/products/:id – Detalhes de um produto.

GET /api/services – Lista serviços e colaboradores.

GET /api/promocoes – Lista promoções destacadas.

Carrinho e favoritos (privado)

GET /api/cart – Retorna o carrinho aberto do usuário autenticado.

POST /api/cart/items – Adiciona ou incrementa item ao carrinho.

PATCH /api/cart/items – Atualiza quantidade de um item.

DELETE /api/cart/items/:produtoId – Remove item específico do carrinho.

GET /api/favorites / POST /api/favorites / DELETE /api/favorites/:productId – Manipula lista de favoritos do usuário.

Checkout e pedidos (privado)

POST /api/checkout – Realiza checkout de um carrinho, calcula frete e aplica cupons.

POST /api/pedidos – Cria um pedido a partir de um carrinho fechado.

GET /api/pedidos – Lista pedidos do usuário ou retorna detalhes de um pedido específico.

Administração (requer token de administrador)

POST /api/admin/products, PUT /api/admin/products/:id, DELETE /api/admin/products/:id – Gerencia produtos.

POST /api/admin/services, PUT /api/admin/services/:id, DELETE /api/admin/services/:id – Gerencia serviços.

GET /api/admin/users, PUT /api/admin/users/:id – Lista e edita usuários.

GET /api/admin/stats – Relatórios de faturamento e métricas.

POST /api/admin/cupons – Cria cupons de desconto.

Considerações de segurança

O login de usuários gera um token JWT; utilize o cabeçalho Authorization: Bearer <token> para chamadas autenticadas.

A rota de perfil (/api/users/me) atualmente utiliza um header x-user-id para identificação. Para produção, recomenda‑se substituir esse método por autenticação real com JWT (removendo a função getUserId) e proteger a rota com o middleware authenticateToken para evitar acesso não autorizado.

O rate limiter adapta-se ao número de falhas de login e protege contra força bruta.

Contribuição

Contribuições são bem-vindas! Sinta‑se à vontade para abrir issues e pull requests. Antes de contribuir, certifique‑se de verificar se sua alteração segue o padrão do projeto e se a documentação das rotas está atualizada.

Licença

Este projeto está licenciado sob os termos especificados no arquivo LICENSE deste repositório.