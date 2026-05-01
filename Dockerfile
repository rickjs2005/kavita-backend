# kavita-backend — production Dockerfile
# Multi-stage build: install deps in builder, copy to slim runtime image.
# Node 22-slim chosen to match CI (node 22.x) with minimal image size.

# ── Stage 1: install dependencies ──────────────────────────────────────
FROM node:22-slim AS deps

WORKDIR /app

# Copy only package files first for layer caching
COPY package.json package-lock.json ./

# Install production dependencies only (no devDependencies).
# sequelize-cli fica disponível pra migrations no entrypoint porque
# é dependency regular (não dev).
#
# NÃO usar --ignore-scripts: bcrypt precisa do postinstall pra
# baixar/compilar o binding nativo (.node). Sem isso, server.js
# crasha em "Cannot find module bcrypt_lib.node".
RUN npm ci --omit=dev

# ── Stage 2: production runtime ────────────────────────────────────────
FROM node:22-slim AS runtime

WORKDIR /app

# Non-root user for security
RUN groupadd --gid 1001 kavita && \
    useradd --uid 1001 --gid kavita --shell /bin/sh --create-home kavita

# Copy production node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application code
COPY . .

# Create uploads directory owned by app user
RUN mkdir -p /app/uploads && chown -R kavita:kavita /app/uploads

# Switch to non-root user
USER kavita

# Default port (overridable via PORT env)
EXPOSE 5000

# Health check — uses the existing /health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:${process.env.PORT||5000}/health').then(r=>{if(!r.ok)throw 1}).catch(()=>process.exit(1))"

# Graceful shutdown: server.js already handles SIGTERM (bootstrap/shutdown.js)
STOPSIGNAL SIGTERM

# ETAPA 1 — entrypoint roda migrations pendentes antes de subir o HTTP
# server. Falha na migration → exit 1 → orquestrador reinicia até
# o schema voltar a bater. Para emergências, SKIP_DB_MIGRATE=1 bypass.
CMD ["node", "scripts/deploy/entrypoint.js"]
