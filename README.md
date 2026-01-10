Kavita Backend

Kavita Backend é a API de um sistema de e-commerce completo, desenvolvido para viabilizar a venda de produtos e serviços. Este projeto fornece toda a infraestrutura de backend necessária para uma loja online, incluindo cadastro de produtos, carrinho de compras, processamento de pedidos, gerenciamento de usuários e um painel administrativo robusto. O objetivo é oferecer uma base sólida, escalável e segura para aplicativos de comércio eletrônico, com código aberto que possa ser estudado, utilizado e estendido por outros desenvolvedores.

Funcionalidades Implementadas

Catalogação de Produtos e Serviços: Cadastro de produtos com categorias, imagens e estoque; cadastro de serviços com profissionais (colaboradores) e especialidades. É possível listar publicamente os produtos, serviços e promoções disponíveis para os clientes no site.

Carrinho de Compras e Favoritos: Usuários autenticados podem criar um carrinho de compras, adicionar produtos (ou serviços), atualizar quantidades e remover itens. O backend mantém um único carrinho "aberto" por usuário. Também há suporte a lista de favoritos: adicionar e remover produtos favoritos para acesso rápido.

Checkout de Pedidos: Processamento completo do pedido no checkout. O sistema calcula o total do pedido, aplica cupons de desconto válidos e estima o frete (com regras de frete grátis por produto ou por quantidade, zonas de entrega, etc.). Integração com pagamentos via Mercado Pago – gera preferências de pagamento (Pix, boleto, cartão) e trata notificações de pagamento (webhook). Após confirmação, registra o pedido no banco de dados com status inicial de pagamento/entrega.

Gerenciamento de Usuários: Funcionalidades de registro de novos usuários e login com autenticação JWT (JSON Web Token). Recuperação de senha por e-mail (fluxo de forgot/reset password). Cada usuário pode gerenciar seus endereços de entrega (CRUD completo de endereços, com apoio de CEP para preenchimento automático de cidade/estado). Endpoint de perfil do usuário para consultar dados e atualizar informações básicas.

Painel Administrativo: Conjunto de endpoints exclusivos para administradores, protegidos por token JWT de administrador e verificação de permissões. Permite gerenciar:

Produtos: criação, edição, remoção e upload de imagens de produtos.

Serviços/Colaboradores: criação, edição, remoção de serviços e seus colaboradores, incluindo upload de fotos e associação com especialidades.

Pedidos: visualização de todos os pedidos realizados, com detalhes dos itens, status de pagamento e entrega; possibilidade de atualizar status (em separação, enviado, etc.).

Cupons de Desconto: criação de novos cupons promocionais (percentual ou valor), listagem e inativação.

Usuários e Administradores: listagem de usuários do sistema, e gerenciamento de contas de administrador (inclusão de novos admins, atribuição de cargos/permissões por meio de perfis de acesso).

Relatórios e Estatísticas: endpoints de relatórios de vendas (faturamento diário, produtos mais vendidos, clientes top, estoque baixo, etc.) formatados para uso em gráficos e dashboards.

Notificações de Carrinhos Abandonados: Sistema de notificação automática para clientes que abandonaram carrinhos sem finalizar a compra. Há um worker dedicado que verifica periodicamente carrinhos abandonados e envia lembretes por e-mail (e prepara integração para WhatsApp). As integrações de envio estão inicialmente em modo mock (simulação via console.log), prontas para conectar a serviços reais como Twilio, Zenvia, etc., conforme configuração.

Documentação da API (Swagger): Todas as rotas da API estão documentadas seguindo o padrão OpenAPI 3.0. Uma interface Swagger UI é servida em /docs, permitindo explorar e testar os endpoints (requisições e respostas) de forma interativa. Isso facilita o entendimento da API tanto para desenvolvedores front-end quanto para outros interessados.

Segurança e Boas Práticas: Implementações para garantir a segurança e estabilidade do sistema:

Autenticação com JWT e proteção de rotas sensíveis (tanto para usuários comuns quanto para administradores, com middleware específico para validar tokens e permissões).

Hash de senhas com Bcrypt, garantindo que senhas de usuários nunca sejam armazenadas em texto puro.

CORS configurável: somente origens confiáveis podem acessar a API, evitando requisições indevidas de outros domínios.

Rate Limiting adaptativo: limite de requisições por IP que aumenta restrições em caso de muitas tentativas de login falhas, ajudando a prevenir ataques de força bruta.

Tratamento global de erros: padronização das respostas de erro da API com códigos de erro específicos (por exemplo, VALIDATION_ERROR, AUTH_ERROR), facilitando o tratamento no front-end.

Monitoramento de ações administrativas sensíveis com logs (ex.: criação/remoção de admins gera registro de auditoria).

Tecnologias e Frameworks Utilizados

Este projeto foi construído com uma stack moderna focada em desempenho e manutenibilidade:

Node.js (versão 16 LTS ou superior) e Express 4 – plataforma e framework web utilizados para criar a API REST de forma rápida e robusta.

MySQL 5.7+ – Banco de dados relacional para persistência dos dados (produtos, pedidos, usuários etc.). Utiliza a biblioteca mysql2 (com Promises) para conectar e executar consultas parametrizadas diretamente (sem ORM), aproveitando flexibilidade e performance em SQL puro.

JWT (jsonwebtoken) – Autenticação stateless via tokens JWT assinados, permitindo que usuários e admins acessem recursos protegidos da API.

Swagger UI & swagger-jsdoc – Documentação interativa auto-gerada a partir de comentários JSDoc nos endpoints. Facilita a experimentação e integração da API por terceiros.

Mercado Pago SDK – Integração com a API de pagamentos do Mercado Pago para criação de pagamentos (Pix, boleto, cartão) e recebimento de notificações automáticas de transações.

Nodemailer – Utilizado para envio de e-mails transacionais (ex: recuperação de senha, notificações de carrinho abandonado) via SMTP. Configurável por variáveis de ambiente para utilizar provedores como Gmail, SendGrid, etc.

Multer – Middleware de upload de arquivos, empregado para tratamento de imagens de produtos e serviços enviados no painel admin, com armazenamento local organizado em pastas (e pronto para evoluir para storage externo se necessário).

Bcrypt – Biblioteca para hash seguro de senhas de usuários e administradores, armazenando apenas os hashes no banco de dados.

Axios / Fetch – Uso de clientes HTTP para integração com serviços externos, por exemplo: consulta de CEPs na API ViaCEP para obter cidade/estado automaticamente no cadastro de endereços.

Jest – Framework de testes configurado (com suporte a supertest para testes de integração das rotas). Obs.: a suíte de testes automatizados está em estágio inicial, ver seção de Roadmap.

Outros utilitários: bibliotecas como cors (segurança de acesso), cookie-parser (parse de cookies JWT quando necessário), uuid (geração de identificadores únicos), slugify (normalização de textos para slugs em URLs), Zod (validações esquemáticas, potencial para validação de payloads).

Estrutura do Projeto

Abaixo está a estrutura de diretórios e arquivos principais do backend, organizada de forma lógica para separar responsabilidades:

├── controllers      # Lógica de negócio centralizada (ex.: checkout, autenticação, etc.)
├── routes           # Definição das rotas da API, separadas por domínio
│   ├── admin        # Rotas de administração (prefixo /api/admin/...)
│   ├── public       # Rotas públicas (prefixo /api/..., ex.: produtos, serviços)
│   ├── ...          # Outras rotas (ex.: auth, users, checkout, payment, etc.)
│   └── index.js     # Agrega e exporta todas as rotas em um único router
├── middleware       # Middlewares globais (autenticação JWT, CORS, rate limiter, logs de requisição)
├── services         # Camada de serviços/integração (ex.: envio de emails, cálculo de frete, notificações WhatsApp)
├── utils            # Funções utilitárias e helpers (ex.: validação de CPF, formatação de valores, geração de tokens)
├── docs             # Configuração do Swagger (documentação OpenAPI da API)
├── config           # Configurações de ambiente e banco de dados (ex.: credenciais, pool de conexões)
├── migrations       # Scripts SQL de criação/atualização do esquema do banco de dados
├── jobs             # Jobs agendados (processos em segundo plano, ex.: worker para carrinhos abandonados)
├── workers          # Workers de background carregados junto ao servidor (ex.: envio automático de emails de carrinho abandonado)
├── teste            # Testes automatizados (unitários e de integração) e configurações do Jest
├── errors           # Definições de classes de erro customizadas e códigos de erro (ErrorCodes)
├── constants        # Constantes utilizadas pelo sistema (ex.: códigos de erro, valores fixos)
├── server.js        # Ponto de entrada da aplicação (inicializa o Express, middlewares, rotas, Swagger, workers)
└── package.json     # Dependências, scripts e metadata do projeto


Essa organização facilita a manutenção e evolução do projeto, separando claramente as responsabilidades de cada camada (por exemplo, routes apenas definem endpoints e delegam lógica aos controllers/services, enquanto middleware trata de aspectos transversais como autenticação).

Como Executar o Projeto Localmente

Siga os passos abaixo para configurar e executar o Kavita Backend em ambiente de desenvolvimento:

Pré-requisitos: Certifique-se de ter instalado em sua máquina o Node.js 16+ e um servidor MySQL 5.7 (ou superior). Também é necessário um banco de dados MySQL vazio para uso do sistema.

Clonar o repositório: Em seu terminal, rode os comandos:

git clone https://github.com/rickjs2005/kavita-backend.git
cd kavita-backend


Instalar dependências: Instale as bibliotecas Node necessárias:

npm install


Configurar banco de dados:

Crie um banco de dados no MySQL para o Kavita (por exemplo, kavita_db).

Importe/execute os scripts SQL de criação de tabelas localizados no diretório migrations (começando pelo 001_create_core_tables.sql e demais, se houver). Isso irá criar as tabelas e estruturas iniciais (produtos, usuários, pedidos, etc.). Dica: Você pode executar manualmente via cliente MySQL ou via linha de comando: mysql -u seuUsuario -p kavita_db < migrations/001_create_core_tables.sql.

(Opcional) Popule tabelas básicas se necessário, ou ajuste configurações iniciais conforme preciso.

Configurar variáveis de ambiente: Crie um arquivo .env na raiz do projeto, contendo as seguintes variáveis (conforme o arquivo de exemplo em config/env.js):

DB_HOST, DB_USER, DB_PASSWORD, DB_NAME – Credenciais e nome do banco de dados MySQL.

JWT_SECRET – Segredo para assinar/verificar tokens JWT.

EMAIL_USER, EMAIL_PASS – Credenciais de uma conta de e-mail SMTP para envio de notificações (por exemplo, dados do Gmail ou outro provedor SMTP).

APP_URL – URL do frontend (por exemplo, endereço do site em produção ou http://localhost:3000 para desenvolvimento) para montagem de links em emails.

BACKEND_URL – URL pública do backend (usada para webhooks de pagamento, etc. Em dev pode ser http://localhost:5000).

MP_ACCESS_TOKEN – Token de acesso do Mercado Pago (necessário para criar pagamentos via API do Mercado Pago).

(Opcional) DB_PORT – Porta do MySQL, se diferente do padrão 3306.

(Opcional) DISABLE_NOTIFICATIONS – Se definida como "true", desabilita integrações reais de notificação (WhatsApp/email), fazendo com que o sistema apenas faça logs em console em vez de enviar mensagens de verdade. Útil para desenvolvimento.

(Opcional) Outras variáveis conforme necessidade (veja detalhes adicionais em config/env.js).

Executar a aplicação: Tudo pronto, inicie o servidor:

npm start


O servidor Express irá subir na porta definida pela variável PORT (caso setada no .env) ou na porta padrão 5000. Você deverá ver no console logs de inicialização confirmando isso (ex.: ✅ Server rodando em http://localhost:5000).

Acessar a documentação: Com o backend rodando, você pode acessar http://localhost:5000/docs em seu navegador para visualizar a documentação Swagger UI e testar os endpoints da API diretamente.

Front-end (opcional): O Kavita possui um projeto frontend complementar (React) disponível no repositório kavita-frontend. Você pode configurá-lo para consumir este backend, ou usar ferramentas como Postman/Insomnia para enviar requisições manualmente durante os testes.

Roadmap e Tarefas em Aberto

Este projeto encontra-se em fase de desenvolvimento ativo. Algumas melhorias e funcionalidades planejadas para as próximas versões:

 Testes Automatizados: Adicionar e expandir a suíte de testes unitários e de integração. Atualmente há ausência de testes abrangentes cobrindo todas as funcionalidades – pretendemos atingir alta cobertura para garantir estabilidade a cada mudança.

 Melhoria na Autenticação de Perfil: A rota de perfil do usuário (GET /api/users/me) será ajustada para usar estritamente JWT do usuário autenticado (removendo soluções temporárias de identificação por header) e garantindo autorização adequada sem necessidade de hacks de desenvolvimento.

 Integração de Notificações em Produção: Conectar os serviços de notificação a provedores reais (por exemplo, API de WhatsApp via Twilio ou Gupshup, serviço de e-mail transacional como SendGrid ou Amazon SES). Isso permitirá que os lembretes de carrinho abandonado e demais alertas sejam entregues de fato aos usuários, tornando a funcionalidade plenamente operacional em ambiente de produção.

 Aprimoramentos no Painel Admin: Futuras melhorias na UI/UX do painel de administração (no projeto frontend) e possíveis novos relatórios gráficos. No backend, isso pode incluir paginação em listagens administrativas, filtros avançados e validações adicionais conforme feedback dos usuários.

 Documentação e Exemplos: Adicionar um guia de uso da API mais detalhado, com exemplos de requisição e resposta, além de gerar clients API (SDKs) básicos para facilitar a integração da API Kavita em outras aplicações.

 Outras Funcionalidades: Alguns recursos estão em estudo, como: integração com gateway de pagamento adicional (ex.: PayPal), suporte a múltiplos endereços de entrega por pedido, mecanismo de busca textual nos produtos/serviços, e internacionalização.

Sinta-se à vontade para abrir issues no GitHub sugerindo novas features ou relatando bugs. A comunidade pode influenciar o roadmap conforme as necessidades mais relevantes. 🚀

Como Contribuir

Contribuições são muito bem-vindas! Se você deseja colaborar com o Kavita Backend, siga estas orientações:

Reporte Problemas: Encontrou um bug ou tem uma sugestão de melhoria? Abra uma issue descrevendo o problema ou ideia. Discussões são importantes para alinhar expectativas antes de qualquer alteração grande.

Fork & PR: Para contribuir com código, faça um fork deste repositório, crie uma nova branch descritiva (por exemplo, feat/novo-relatorio-vendas ou fix/carrinho-null-error), implemente sua alteração e então abra um Pull Request. Lembre-se de escrever um título e descrição claros no PR, e referencie a issue relacionada se houver.

Padrões de Código: Mantenha o estilo de código consistente com o projeto (uso de padrão async/await, tratamento de erros com AppError, etc.). Se adicionar endpoints, documente-os adequadamente nos comentários Swagger (@openapi) para manter a documentação atualizada. Se possível, inclua testes para a nova funcionalidade ou correção.

Discussão e Review: Esteja aberto a feedback. Nem todo PR será mesclado imediatamente – pode haver revisão de código e solicitações de mudança para garantir qualidade e aderência à visão do projeto.

Ao contribuir, você estará aprendendo e ajudando outros desenvolvedores a construir soluções melhores. Cada melhoria conta! 🎉

Licença

Este projeto é distribuído sob a licença ISC (semelhante à MIT). Isso significa que você pode usar, modificar e distribuir o código à vontade, desde que atribua os devidos créditos ao autor. Para mais detalhes, consulte o arquivo LICENSE incluído no repositório.

📣 Chamado à Ação

Gostou do Kavita Backend? Então não deixe de dar uma estrela no repositório GitHub para mostrar seu apoio! ⭐

Sinta-se livre para compartilhar este projeto nas suas redes sociais (como o LinkedIn) e marcar outros desenvolvedores que possam se interessar. Assim, você nos ajuda a divulgar esta iniciativa e fortalecer a comunidade em torno de projetos open-source de e-commerce.

Vamos construir juntos uma plataforma robusta e aberta! Conecte-se conosco, compartilhe suas ideias e vamos codar algo incrível! 🚀✨
