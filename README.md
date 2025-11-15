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

## 🔧 Variáveis de Ambiente

As principais variáveis suportadas pela API estão listadas abaixo. Todas podem ser definidas via `.env`, variáveis do container ou secrets em produção.

| Variável | Descrição | Default |
|----------|-----------|---------|
| `PORT` | Porta HTTP da API | `5000` |
| `NODE_ENV` | Ambiente de execução (`development`, `production`, `test`) | `development` |
| `ALLOWED_ORIGINS` | Lista de domínios autorizados pelo CORS (separados por vírgula) | `http://localhost:3000` |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Parâmetros de conexão com o MySQL | `localhost`, `3306`, `root`, vazio, `kavita` |
| `DB_CONNECTION_LIMIT` | Máximo de conexões simultâneas no pool | `10` |
| `DB_WAIT_FOR_CONNECTIONS` | Mantém requisições na fila aguardando conexão livre | `true` |
| `DB_MAX_IDLE` | Número de conexões ociosas preservadas pelo pool | `10` |
| `DB_IDLE_TIMEOUT` | Tempo (ms) para encerrar conexões ociosas | `60000` |
| `DB_ENABLE_KEEP_ALIVE` / `DB_KEEP_ALIVE_DELAY` | Configuram keep-alive TCP | `true` / `0` |
| `DB_POOL_LOGGING` | Ativa logs e métricas do pool (`true`/`false`) | `false` |
| `DB_POOL_METRICS_INTERVAL` | Intervalo (ms) para registrar métricas do pool | `30000` |
| `STORAGE_DRIVER` | `local`, `s3` ou `gcs` | `local` |
| `STORAGE_CDN_URL` / `CDN_BASE_URL` | Base da CDN para servir mídia | — |
| `UPLOAD_MAX_FILE_SIZE` | Limite (bytes) para uploads via Multer | `5MB` |
| `AWS_*` | Credenciais/region/bucket para S3 | — |
| `GCS_BUCKET`, `GCP_PROJECT_ID`, `GOOGLE_APPLICATION_CREDENTIALS_JSON` | Configuração do Google Cloud Storage | — |
| `SECRETS_MANAGER_SECRET_ID` | ARN/ID do segredo usado na rotação automatizada | — |
| `DB_ADMIN_USER`, `DB_ADMIN_PASSWORD`, `DB_USER_HOST` | Credenciais administrativas para rotação de senha | — |

> 💡 Use `UPDATE_ENV_FILE=true` e `ENV_FILE_PATH` para sobrescrever automaticamente o `.env` ao executar a rotação de segredos.

---

## ☁️ Armazenamento de Arquivos

O backend agora armazena mídia em provedores externos com CDN:

1. Configure o driver desejado:
   - `STORAGE_DRIVER=local` mantém comportamento antigo usando a pasta `uploads/` (apenas para desenvolvimento).
   - `STORAGE_DRIVER=s3` exige `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` e `AWS_S3_BUCKET`.
   - `STORAGE_DRIVER=gcs` exige `GCS_BUCKET` e as credenciais do serviço em `GOOGLE_APPLICATION_CREDENTIALS_JSON` (JSON do keyfile).
2. Informe a URL pública via `STORAGE_CDN_URL`. Todas as imagens persistidas são gravadas com o endereço completo (sem depender de `/uploads`).
3. Endpoints antigos continuam aceitando `keepImages` com caminhos legados; eles são normalizados para o formato CDN automaticamente.
4. Instale os SDKs oficiais apenas quando for utilizá-los: `npm install @aws-sdk/client-s3` para S3 e `npm install @google-cloud/storage` para GCS.

As rotas de produtos/serviços utilizam upload em memória com limpeza automática em caso de erro. O endpoint `/uploads/*` redireciona para a CDN quando o driver não é `local`.

---

## 🚢 Fluxos de Deploy

### Docker Compose

O arquivo [`deploy/docker-compose.yml`](deploy/docker-compose.yml) demonstra uma stack mínima com API e MySQL. Para subir em produção:

```bash
cp .env.example .env            # Ajuste as variáveis sensíveis
docker compose -f deploy/docker-compose.yml up -d --build
```

Monte um volume para `uploads/` apenas quando usar `STORAGE_DRIVER=local`. Para S3/GCS, configure as variáveis de credencial e remova o bind.

### Kubernetes

O diretório [`deploy/kubernetes/`](deploy/kubernetes) inclui `ConfigMap`, `Secret`, `Deployment` e `Service`.

```bash
kubectl apply -f deploy/kubernetes/secret.yaml
kubectl apply -f deploy/kubernetes/configmap.yaml
kubectl apply -f deploy/kubernetes/deployment.yaml
kubectl apply -f deploy/kubernetes/service.yaml
```

Adapte as variáveis e substitua os placeholders das credenciais antes de aplicar. Utilize um Ingress Controller ou LoadBalancer para expor o serviço conforme sua stack.

---

## 🤖 CI/CD

- Pipeline definido em [`.github/workflows/ci.yml`](.github/workflows/ci.yml).
- Jobs executam lint (`npm run lint`), testes (`npm test`), migrations (`npm run migrate`) e build da imagem Docker.
- Em merges para `main`/`master`, as migrations são reaplicadas automaticamente usando secrets de produção.

Configure os segredos `PROD_DB_*` e, opcionalmente, credenciais do registry (`GHCR_PAT`) para publicar imagens.

---

## 🛡️ Operações (Backups, Segredos, Monitoramento)

- **Backups**: `npm run backup` executa [`ops/backup/run-backup.js`](ops/backup/run-backup.js), gera `mysqldump`, compacta (`.gz`) e envia para o storage configurado. Garanta que o binário `mysqldump` esteja disponível na máquina/contêiner.
- **Rotação de segredos**: `npm run rotate:secrets` (arquivo [`ops/secrets/rotate.js`](ops/secrets/rotate.js)) atualiza a senha do usuário MySQL, grava no AWS Secrets Manager e, opcionalmente, sobrescreve o `.env`. Instale `@aws-sdk/client-secrets-manager` quando utilizar o fluxo.
- **Migrations automatizadas**: `npm run migrate` usa [`ops/migrations/run.js`](ops/migrations/run.js) e mantém o histórico na tabela `schema_migrations`.
- **Monitoramento**: o stack em [`ops/monitoring/`](ops/monitoring) provisiona Prometheus, Grafana, Loki e Promtail via Docker Compose. Ajuste `APP_METRICS_TARGET` para apontar para seu endpoint `/metrics` (se exposto) e publique dashboards no Grafana.

Para observabilidade adicional, combine os dados de pool de conexões (ativando `DB_POOL_LOGGING=true`) com a stack Prometheus/Grafana.

---

## ✉️ Contato

Se você tiver dúvidas ou quiser contribuir, entre em contato:
- Email: suporte@kavita.com

---

Desenvolvido com ❤️ para gestão de produtos agropecuários.
