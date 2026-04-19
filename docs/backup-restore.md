# Backup e Restore — MySQL

Procedimento operacional para backup automático e restore assistido do
banco do Kavita.

## Visão geral

- **Estratégia:** dump lógico (`mysqldump --single-transaction`)
  comprimido com gzip via `zlib` do Node (cross-platform, sem depender
  de `gzip` no PATH).
- **Script:** `scripts/backup-mysql.js` — roda em Windows, Linux e macOS.
- **Retenção padrão:** 30 dias (configurável via `BACKUP_RETENTION_DAYS`).
- **Destino padrão:** `./backups/kavita-YYYY-MM-DDTHH-MM-SS.sql.gz`.
- **Escopo:** schema + dados + routines + triggers + events.

Não substitui backup binário/PITR (point-in-time recovery). Para
RPO < 1h, adicionar replicação ou `--master-data` + binlog fora do
escopo deste script.

## Variáveis

Lidas do ambiente ou de `.env`:

| Var | Default | Descrição |
|---|---|---|
| `DB_HOST` | — | Host do MySQL (obrigatório) |
| `DB_PORT` | `3306` | Porta |
| `DB_USER` | — | Usuário (obrigatório) |
| `DB_PASSWORD` | — | Senha (passada via `MYSQL_PWD` no env, não visível em `ps`) |
| `DB_NAME` | — | Nome do banco (obrigatório) |
| `BACKUP_DIR` | `./backups` | Onde salvar |
| `BACKUP_RETENTION_DAYS` | `30` | Dias de retenção |
| `MYSQLDUMP_PATH` | (PATH) | Caminho explícito — Windows típico: `C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe` |

O usuário do banco usado no backup precisa de `SELECT, LOCK TABLES,
SHOW VIEW, TRIGGER, EVENT, PROCESS, RELOAD`. Em MySQL 8+, `PROCESS`
só é necessário se usar `--tablespaces` — o script passa `--no-tablespaces`.

## Executar backup manual

```bash
cd kavita-backend
npm run db:backup
```

Saída esperada:

```
[backup] Dump começando: kavita@127.0.0.1:3306 → ./backups/kavita-2026-04-19T16-38-09.sql.gz
[backup] OK — ./backups/kavita-2026-04-19T16-38-09.sql.gz (30.52 MB)
[backup] Retenção: 12 mantidos, 0 apagados (> 30d).
```

## Agendar backup diário

### Linux / macOS (cron, 3h da manhã)

```cron
0 3 * * * cd /srv/kavita/kavita-backend && /usr/bin/node scripts/backup-mysql.js >> /var/log/kavita-backup.log 2>&1
```

Adicione a linha via `crontab -e` do usuário que tem acesso ao `.env`
(provavelmente o user que roda o backend). Valide no dia seguinte:

```bash
tail -20 /var/log/kavita-backup.log
ls -lh /srv/kavita/kavita-backend/backups/ | head -5
```

### Docker / Kubernetes

Subir como CronJob separado com o mesmo volume `BACKUP_DIR` e as env
vars do banco. O container pode ser o mesmo do backend, chamando
`node scripts/backup-mysql.js` no `command`.

### Windows (Task Scheduler)

1. Abrir **Agendador de Tarefas** → **Criar Tarefa Básica**
2. Nome: `Kavita - Backup MySQL diário`
3. Disparador: **Diariamente às 03:00**
4. Ação: **Iniciar um programa**
5. Programa/script: `C:\Program Files\nodejs\node.exe`
6. Argumentos: `scripts\backup-mysql.js`
7. Iniciar em: `C:\Users\rickj\kavita\kavita-backend` (ajustar ao seu path)
8. Concluir
9. Botão direito na tarefa → Propriedades → aba "Geral":
   - Marcar "**Executar estando o usuário conectado ou não**"
   - Marcar "**Executar com privilégios mais altos**"

Validar manual:
```powershell
# Na pasta do projeto:
npm run db:backup
dir backups
```

## Restore

O restore é destrutivo. **Sempre** faça um backup do estado atual
antes de restaurar.

### Linux / macOS

```bash
# 1. Backup do estado atual (plano B)
npm run db:backup

# 2. Restore (substitui TUDO do banco atual)
gunzip -c backups/kavita-2026-04-15T06-00-00.sql.gz | mysql \
  --host=$DB_HOST --user=$DB_USER --password=$DB_PASSWORD $DB_NAME

# 3. Smoke test
# ... logar no admin, abrir painel corretora, conferir lead count
```

### Windows (cmd/PowerShell)

```powershell
# PowerShell. Ajustar os paths.
$dump = "C:\Users\rickj\kavita\kavita-backend\backups\kavita-2026-04-15T06-00-00.sql.gz"
$mysql = "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe"
$gunzip = { param($f) [System.IO.Compression.GzipStream]::new([System.IO.File]::OpenRead($f), [System.IO.Compression.CompressionMode]::Decompress) }

# Opção mais simples: abrir o .sql.gz com 7-Zip, extrair, e importar:
& "$mysql" --host=127.0.0.1 --user=root --password=SENHA kavita < kavita-2026-04-15T06-00-00.sql
```

## Teste de restore (trimestral — obrigatório)

Nunca confie num backup que você não testou restaurar.

1. Criar banco vazio de staging:
   ```sql
   CREATE DATABASE kavita_restore_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```
2. Restaurar para `kavita_restore_test` o dump mais recente.
3. Validar contagens-chave:
   ```sql
   SELECT COUNT(*) FROM corretoras;
   SELECT COUNT(*) FROM corretora_leads;
   SELECT COUNT(*) FROM admin_audit_logs;
   ```
4. Subir backend apontando `DB_NAME=kavita_restore_test` em staging e
   fazer smoke test de login admin + painel corretora.
5. Registrar em `docs/runbook.md` (data, duração, resultado).

## Checklist operacional

- [ ] `BACKUP_DIR` em volume distinto do banco (ou disco separado).
- [ ] Backup diário agendado (cron ou Task Scheduler).
- [ ] Log do backup monitorado — alerta se não rodou nas últimas 24h.
- [ ] Arquivos enviados para off-site (S3/R2/GCS) — ver P0-03.
- [ ] Restore testado ao menos 1× por trimestre.
- [ ] Usuário do mysqldump tem permissões mínimas (não usa root em produção).

## Off-site (S3/R2)

Hoje o script só faz backup local. Quando P0-03 (upload S3/R2) estiver
ativo, um hook simples pode subir automaticamente:

### Linux cron com upload

```cron
0 3 * * * cd /srv/kavita/kavita-backend && node scripts/backup-mysql.js && aws s3 sync ./backups/ s3://kavita-backups/mysql/ --exclude "*" --include "*.sql.gz" >> /var/log/kavita-backup.log 2>&1
```

### Alternativas mais robustas (futuras)

- **PITR via binlog** (RPO < 1h): requer replicação ou rsync do binlog.
- **Criptografia do dump em repouso**: `gpg --symmetric --cipher-algo AES256`.
- **Backup incremental**: Percona XtraBackup (físico, não lógico).

Débito técnico conhecido — aceitável para MRR < R$ 10k/mês.

## Pendências

- [ ] Off-site sync automatizado (depende de P0-03 — upload S3/R2).
- [ ] PITR via binlog (RPO < 1h) — não implementado.
- [ ] Criptografia do dump em repouso — não implementado.
- [ ] Alerta automático se backup não rodar em 24h (depende de APM/cron wrapper).
