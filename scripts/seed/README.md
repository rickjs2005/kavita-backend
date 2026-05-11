# Seed para apresentação privada (demo 30min)

Popula o banco com dados realistas para o roteiro público da demo:
catálogo, cupons, news, drone models. **Não cobre** pedidos, corretoras,
admins demo ou usuário cliente demo — esses devem ser criados via admin
UI ou via fluxo real (instruções abaixo).

## O que o seed cria

| Tabela | Quantidade | Idempotência |
|---|---|---|
| categories | 6 | INSERT IGNORE por slug |
| products | 12 | skip se name idêntico já existe |
| cupons | 3 (BEMVINDO10, FRETEAGRO50, CAFE15) | INSERT IGNORE por código |
| news_posts | 6 publicados | INSERT IGNORE por slug |
| drone_models | 5 modelos DJI Agras | INSERT IGNORE por key |

Pode rodar várias vezes sem duplicar.

## Como rodar

```bash
cd kavita-backend

# Dry-run primeiro (mostra o que faria, não grava):
node scripts/seed/demo.js --dry-run

# Aplicar de verdade:
node scripts/seed/demo.js
```

Usa as envs do `.env` do diretório do backend para conectar ao MySQL.
Faz tudo dentro de uma transação — se algo falhar, nada é gravado.

## O que falta criar manualmente (5–10 min)

### 1. Admin demo com MFA

Não criar via SQL bruto — passe pelo fluxo de cadastro do admin master
para gerar bcrypt correto e ativar 2FA.

1. Faça login com o admin master existente.
2. Vá em `/admin/admins` → "Novo admin".
3. Crie `demo@kavita.com.br` com role `master` (ou role intermediário
   que tenha as permissões dos módulos do roteiro: `produtos.ver`,
   `pedidos.ver`, `config.editar`, `mercado_cafe_view`).
4. Faça logout, entre como `demo@kavita.com.br`, vá em
   `/admin/totp/setup` e configure o 2FA com um app autenticador.
5. Use **essa conta** durante a apresentação. **Nunca** mostre o admin
   master no palco.

### 2. Usuário cliente demo

Mesmo princípio: crie via `/register` no frontend. Email
`cliente@demo.kavita.com.br`, senha forte que você lembre. Adicione
1 endereço em `/meus-dados/enderecos`. Adicione 3-4 produtos ao
carrinho antes da call para o admin já mostrar carrinho ativo.

### 3. Corretora demo

Cadastro via `/mercado-do-cafe/corretora-cadastro` (formulário público)
ou no admin via `/admin/mercado-do-cafe`. Preencher CNPJ válido, cidade
real, descrição profissional, foto. Aprovar via admin antes da demo.

Mínimo recomendado: **6 corretoras** distribuídas (Manhuaçu, Caratinga,
Espera Feliz, Cachoeira do Itapemirim, Venda Nova do Imigrante, Patrocínio).

### 4. Pedidos simulados

Forma mais simples: faça 4-6 checkouts reais usando o cliente demo
com cartão sandbox do Mercado Pago. Cada pedido fica com status
realista (pago/preparando/enviado) conforme você avança o status no
admin. Banco fica com data e fluxo plausíveis.

### 5. Hero slides + categorias com imagem

Pelo admin (`/admin/destaques/hero-slides` e
`/admin/configuracoes/categorias`): subir 2-3 imagens hero
profissionais e 1 imagem por categoria. **NÃO** subir nada via demo ao
vivo enquanto storage estiver em disco local efêmero.

## Notas

- O seed NÃO toca em uploads/imagens — produtos ficam com `image=NULL`.
  Subir imagens via admin antes da call (idealmente com storage R2/S3
  já ativo, mas para piloto disco local serve se você não fizer deploy
  entre upload e demo).
- O seed NÃO cria admins nem usuários — bcrypt direto via SQL é frágil
  e a senha plaintext fica no histórico do shell.
- Para resetar: cada tabela tem coluna identificadora (slug, código,
  key) — pode rodar `DELETE FROM <tabela> WHERE slug LIKE '…'` se
  precisar limpar antes de re-seedar.
