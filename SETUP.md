# Guia de Configuração — Kavita Backend

Este guia descreve como configurar e executar o backend do projeto Kavita em ambiente de desenvolvimento local.

---

## Índice

1. [Pré-requisitos](#1-pré-requisitos)
2. [Instalação das dependências](#2-instalação-das-dependências)
3. [Configuração do ambiente](#3-configuração-do-ambiente)
4. [Configuração do banco de dados](#4-configuração-do-banco-de-dados)
5. [Executando o servidor de desenvolvimento](#5-executando-o-servidor-de-desenvolvimento)
6. [Health checks](#6-health-checks)
7. [Testes](#7-testes)
8. [Estrutura do projeto](#8-estrutura-do-projeto)
9. [Problemas comuns e solução de problemas](#9-problemas-comuns-e-solução-de-problemas)

---

## 1. Pré-requisitos

Certifique-se de ter os seguintes softwares instalados:

| Software | Versão mínima recomendada | Download |
|----------|--------------------------|----------|
| Node.js  | 18.x LTS ou superior     | https://nodejs.org |
| npm      | 9.x ou superior (incluído com Node.js) | — |
| MySQL    | 8.0 ou superior          | https://dev.mysql.com/downloads |

Para verificar as versões instaladas:

```bash
node -v
npm -v
mysql --version
```

---

## 2. Instalação das dependências

Clone o repositório e instale as dependências do projeto:

```bash
git clone <url-do-repositorio>
cd kavita-backend
npm install
```

---

## 3. Configuração do ambiente

O projeto utiliza variáveis de ambiente para configurar o comportamento da aplicação. Copie o arquivo de exemplo e edite conforme o seu ambiente:

```bash
cp .env.example .env
```

Abra o arquivo `.env` e preencha os valores. As variáveis **obrigatórias** para a aplicação iniciar são:

| Variável       | Descrição                                        | Exemplo                        |
|----------------|--------------------------------------------------|--------------------------------|
| `JWT_SECRET`   | Chave secreta para assinar tokens JWT            | `minha_chave_super_secreta`    |
| `EMAIL_USER`   | Usuário/endereço de e-mail para envio de e-mails | `noreply@seudominio.com`       |
| `EMAIL_PASS`   | Senha ou app-password da conta de e-mail         | `senha_do_email`               |
| `APP_URL`      | URL base do frontend                             | `http://localhost:3000`        |
| `BACKEND_URL`  | URL base do próprio backend                      | `http://localhost:5000`        |
| `DB_HOST`      | Host do banco de dados MySQL                     | `127.0.0.1`                    |
| `DB_USER`      | Usuário do banco de dados                        | `root`                         |
| `DB_PASSWORD`  | Senha do banco de dados                          | `sua_senha`                    |
| `DB_NAME`      | Nome do banco de dados principal                 | `kavita`                       |

> **Atenção:** a aplicação lança um erro e não inicia caso qualquer uma das variáveis acima esteja ausente.

### Variáveis opcionais relevantes

| Variável      | Padrão       | Descrição                              |
|---------------|--------------|----------------------------------------|
| `PORT`        | `5000`       | Porta em que o servidor escuta         |
| `NODE_ENV`    | `development`| Ambiente de execução                   |
| `DB_PORT`     | `3306`       | Porta do banco de dados                |
| `JWT_EXPIRES_IN` | `7d`      | Tempo de expiração dos tokens JWT      |
| `ALLOWED_ORIGINS` | —        | Origens permitidas no CORS (separadas por vírgula) |
| `MP_ACCESS_TOKEN` | —        | Token de acesso do Mercado Pago (necessário apenas para funcionalidades de pagamento; use o token sandbox em desenvolvimento) |

---

## 4. Configuração do banco de dados

### 4.1 Criar o banco de dados

Acesse o MySQL e crie o banco de dados:

```sql
CREATE DATABASE kavita CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Se você também precisar do banco de testes:

```sql
CREATE DATABASE kavita_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 4.2 Executar as migrations

As migrations criam todas as tabelas necessárias. Execute o comando abaixo:

```bash
npm run db:migrate
```

Para verificar o status das migrations aplicadas:

```bash
npm run db:status
```

### 4.3 Banco de dados de testes

Para preparar o banco de dados utilizado nos testes automatizados:

```bash
npm run db:test:reset
```

Esse comando recria o banco de testes e aplica todas as migrations no ambiente `test`.

---

## 5. Executando o servidor de desenvolvimento

Inicie o servidor em modo de desenvolvimento (com reinicialização automática via `nodemon`):

```bash
npm run dev
```

Saída esperada no terminal:

```
[nodemon] starting `node server.js`
🚀 Servidor rodando na porta 5000
📄 Swagger disponível em http://localhost:5000/docs
```

Para iniciar sem `nodemon` (modo produção/manual):

```bash
npm start
```

---

## 6. Health checks

Após iniciar o servidor, verifique se está respondendo corretamente:

### Verificação básica

```bash
curl http://localhost:5000/docs
```

Deve retornar a página HTML do Swagger UI.

### Documentação da API (Swagger)

Acesse no navegador:

```
http://localhost:5000/docs
```

A especificação OpenAPI em formato JSON está disponível em:

```
http://localhost:5000/api-docs.json
```

### Smoke test de build

Para verificar se o projeto carrega sem erros de sintaxe/importação:

```bash
npm run build
```

Saída esperada:

```
✅ build smoke ok
```

---

## 7. Testes

O projeto usa [Jest](https://jestjs.io/) como framework de testes. Antes de rodar os testes, certifique-se de que o banco de dados de testes está configurado (consulte a [seção 4.3](#43-banco-de-dados-de-testes)).

### Executar todos os testes

```bash
npm test
```

### Executar apenas testes unitários

```bash
npm run test:unit
```

### Executar apenas testes de integração

```bash
npm run test:int
```

### Executar testes com relatório de cobertura

```bash
npm run test:cov
```

### Executar testes em modo watch (re-executa ao salvar)

```bash
npm run test:watch
```

---

## 8. Estrutura do projeto

```
kavita-backend/
├── config/          # Configuração da aplicação (env, banco, auth)
├── constants/       # Constantes globais (códigos de erro, etc.)
├── controllers/     # Lógica de negócio dos endpoints
├── docs/            # Configuração do Swagger/OpenAPI
├── errors/          # Classes de erro customizadas
├── jobs/            # Scripts de jobs agendados (ex.: carrinho abandonado)
├── middleware/      # Middlewares Express (autenticação, rate limiting, etc.)
├── migrations/      # Arquivos de migration do Sequelize
├── models/          # Modelos do Sequelize (mapeamento de tabelas)
├── routes/          # Definição das rotas da API
├── scripts/         # Scripts utilitários (schema, banco de dados)
├── services/        # Camada de serviços (regras de negócio reutilizáveis)
├── teste/           # Testes automatizados (unit/ e integration/)
├── utils/           # Funções utilitárias genéricas
├── vendor/          # Dependências locais/vendorizadas
├── workers/         # Workers de processamento em background
├── .env.example     # Modelo de variáveis de ambiente
├── .sequelizerc     # Configuração dos caminhos do Sequelize CLI
├── package.json     # Dependências e scripts npm
├── schema.sql       # Schema SQL de referência
└── server.js        # Ponto de entrada da aplicação
```

---

## 9. Problemas comuns e solução de problemas

### ❌ `Error: Variáveis de ambiente ausentes: JWT_SECRET, ...`

**Causa:** O arquivo `.env` não existe ou está com variáveis obrigatórias faltando.

**Solução:**
1. Verifique se o arquivo `.env` existe na raiz do projeto.
2. Certifique-se de que todas as variáveis obrigatórias listadas na [seção 3](#3-configuração-do-ambiente) estão preenchidas.

---

### ❌ `Error: connect ECONNREFUSED 127.0.0.1:3306`

**Causa:** O serviço do MySQL não está em execução ou as credenciais estão incorretas.

**Solução:**
1. Inicie o MySQL: `sudo systemctl start mysql` (Linux) ou inicie via MySQL Workbench/MAMP/WAMP (Windows/macOS).
2. Confirme que `DB_HOST`, `DB_PORT`, `DB_USER` e `DB_PASSWORD` no `.env` estão corretos.

---

### ❌ `Cannot find module './middleware/adaptiveRateLimiter'`

**Causa:** Algum arquivo de middleware pode estar ausente ou o caminho está errado.

**Solução:**
1. Verifique se todos os arquivos da pasta `middleware/` estão presentes.
2. Execute `npm install` para garantir que todas as dependências estão instaladas.

---

### ❌ `npm run test` falha com erros de banco de dados

**Causa:** O banco de dados de testes não foi criado ou as migrations não foram aplicadas.

**Solução:**
```bash
npm run db:test:reset
```

---

### ❌ Porta 5000 já em uso

**Causa:** Outro processo está usando a porta 5000.

**Solução:**
- Altere a variável `PORT` no `.env` para outra porta (ex.: `PORT=5001`), ou
- Identifique e encerre o processo que ocupa a porta:
  ```bash
  # Linux/macOS
  lsof -ti :5000 | xargs kill -9

  # Windows (PowerShell)
  Get-Process -Id (Get-NetTCPConnection -LocalPort 5000).OwningProcess | Stop-Process
  ```

---

### ❌ Tokens JWT expiram antes do esperado

**Causa:** `JWT_EXPIRES_IN` pode estar configurado com um valor muito curto.

**Solução:** Ajuste a variável `JWT_EXPIRES_IN` no `.env` para um valor adequado, por exemplo `7d` para 7 dias.

---

> Para dúvidas adicionais, consulte a documentação da API em `http://localhost:5000/docs` após iniciar o servidor.
