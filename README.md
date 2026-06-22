# Campster

**Campster** is a self-hostable, open-source email marketing platform for cross-functional teams. Centralize campaigns, contacts, analytics, and transactional emails under one system with full data ownership.

**Stack:** NestJS API · Next.js 14 UI · PostgreSQL · Kysely ORM · Nodemailer

---

## Table of Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Local Setup](#local-setup)
- [Environment Variables](#environment-variables)
- [Running Locally](#running-locally)
- [Database Migrations](#database-migrations)
- [Self-Hosting](#self-hosting)
  - [Docker Compose (recommended)](#docker-compose-recommended)
  - [Building Docker Images manually](#building-docker-images-manually)
  - [Kubernetes / any container runtime](#kubernetes--any-container-runtime)
- [Running Tests](#running-tests)
- [Project Structure](#project-structure)
- [Runbook](#runbook)

---

## Features

- **Self-hostable** — full control over your data and infrastructure
- **Campaign management** — create, schedule, and send bulk email campaigns
- **Contact lists** — import via CSV, manage segments
- **Email templates** — visual drag-and-drop builder
- **Transactional emails** — API-triggered emails with templates
- **Real-time analytics** — opens, clicks, bounces
- **A/B testing** — compare subject lines and content
- **Role-based access control** — fine-grained team permissions
- **Multiple SMTP adapters** — bring your own mail server

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | 20+ | 20 LTS recommended |
| Yarn | 1.x | used throughout the repo |
| PostgreSQL | 14+ | required; SQLite is not supported |
| Git | 2.x+ | |
| Docker + Compose | v2+ | for self-hosting only |

**PostgreSQL must be running before you start the API.** The quickest way to spin one up locally:

```bash
# With Docker (no local Postgres install required)
docker run -d \
  --name campster-db \
  -e POSTGRES_DB=campster \
  -e POSTGRES_USER=campster \
  -e POSTGRES_PASSWORD=campster \
  -p 5432:5432 \
  postgres:16-alpine
```

---

## Local Setup

### 1. Clone the repository

```bash
git clone https://github.com/Abhi-Bhat18/campster.git
cd campster
```

### 2. Install all dependencies

```bash
yarn install
```

This installs dependencies for both `packages/api` and `packages/client` via Yarn workspaces.

### 3. Configure the API environment

```bash
cp packages/api/.env.development packages/api/.env
```

Open `packages/api/.env` and set the values for your environment — at minimum the database credentials and SMTP server. See [Environment Variables](#environment-variables) for a full reference.

### 4. Configure the client environment

```bash
cp packages/client/.env packages/client/.env.local
```

The default `NEXT_PUBLIC_API_URL=http://localhost:1335` works out of the box for local development.

### 5. Run database migrations

```bash
cd packages/api
yarn seed
cd ../..
```

This creates all tables and inserts seed data. The API will not start correctly without running this first.

### 6. Start both services

In two separate terminals:

```bash
# Terminal 1 — API (http://localhost:1335)
cd packages/api && yarn start:dev

# Terminal 2 — Client (http://localhost:3000)
cd packages/client && yarn dev
```

Open `http://localhost:3000` in your browser.

---

## Environment Variables

### API — `packages/api/.env`

```bash
# ── Server ─────────────────────────────────────────────────────────────────────
PORT=1335
NODE_ENV=development

# ── Authentication ─────────────────────────────────────────────────────────────
JWT_SECRET=replace-with-a-random-secret-at-least-32-chars
JWT_EXPIRES_IN=7d

# ── Database (PostgreSQL required) ─────────────────────────────────────────────
DB_NAME=campster
DB_USER=campster
DB_PASSWORD=campster
DB_HOST=localhost
DB_PORT=5432

# ── Email sending (SMTP) ────────────────────────────────────────────────────────
MAIL_HOST=smtp.example.com       # your SMTP server hostname or IP
MAIL_PORT=587                    # 587 (STARTTLS) or 465 (SSL) or 25
MAIL_USER=you@example.com
MAIL_PASS=yourpassword

# ── Campaign processing ─────────────────────────────────────────────────────────
BATCH_SIZE=1000                  # contacts per batch
CONCURRENT_BATCHES=5             # batches processed in parallel

# ── CORS ────────────────────────────────────────────────────────────────────────
CORS_DOMAINS=http://localhost:3000,http://127.0.0.1:3000

# ── Service URLs ────────────────────────────────────────────────────────────────
API_HOST=http://localhost:1335
CLIENT_HOST=http://localhost:3000

# ── Bounce handling (optional) ─────────────────────────────────────────────────
BOUNCE_API_KEY=your-bounce-webhook-secret
```

### Client — `packages/client/.env.local`

```bash
# URL the browser uses to reach the API
NEXT_PUBLIC_API_URL=http://localhost:1335
```

---

## Running Locally

```bash
# API in watch mode (reloads on file change)
cd packages/api && yarn start:dev

# API in production mode (compiled output)
cd packages/api && yarn build && yarn start:prod

# Client in dev mode (hot reload)
cd packages/client && yarn dev

# Client in production mode
cd packages/client && yarn build && yarn start
```

Both from the repo root using the Makefile:

```bash
make dev         # starts the API in watch mode
make build-api   # builds the API
make build-client # builds the client
```

---

## Database Migrations

Campster uses [Kysely](https://kysely.dev/) for type-safe query building and Kysely's built-in migrator for schema migrations. Migration files live in `packages/api/src/migrations/`.

### Run all pending migrations + seed data

```bash
cd packages/api
yarn seed
```

### Roll back the last migration

```bash
cd packages/api
npx ts-node --files -r tsconfig-paths/register src/migrate-down.ts
```

### Add a new migration

Create a new numbered file in `packages/api/src/migrations/` (e.g. `15_new_table.ts`) following the existing pattern, then run `yarn seed`.

---

## Self-Hosting

### Docker Compose (recommended)

This is the fastest way to get a production-ready instance running. The setup below starts PostgreSQL, the API, and the UI as separate containers with a shared private network.

**Step 1 — Create a `.env` file** at the directory where you'll run Compose:

```bash
cat > .env <<'EOF'
# Generate a strong secret: openssl rand -hex 32
JWT_SECRET=replace-with-a-strong-random-secret

# PostgreSQL credentials (used by both the db service and the API)
POSTGRES_DB=campster
POSTGRES_USER=campster
POSTGRES_PASSWORD=change-this-password

# SMTP — replace with your mail server
MAIL_HOST=smtp.example.com
MAIL_PORT=587
MAIL_USER=you@example.com
MAIL_PASS=yourpassword

# Public URL your browser uses to reach the API (change for real domain)
NEXT_PUBLIC_API_URL=http://localhost:1335
EOF
```

**Step 2 — Create `docker-compose.yml`:**

```yaml
version: "3.9"

services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-campster}
      POSTGRES_USER: ${POSTGRES_USER:-campster}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-campster}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-campster}"]
      interval: 5s
      timeout: 5s
      retries: 10
    networks:
      - campster-network

  api:
    image: abhishekbhat18/campster-api:latest
    # build:
    #   context: ./packages/api    # uncomment to build from source
    restart: unless-stopped
    ports:
      - "1335:1335"
    environment:
      NODE_ENV: production
      PORT: 1335
      JWT_SECRET: ${JWT_SECRET}
      JWT_EXPIRES_IN: 7d
      DB_HOST: db
      DB_PORT: 5432
      DB_NAME: ${POSTGRES_DB:-campster}
      DB_USER: ${POSTGRES_USER:-campster}
      DB_PASSWORD: ${POSTGRES_PASSWORD:-campster}
      MAIL_HOST: ${MAIL_HOST}
      MAIL_PORT: ${MAIL_PORT:-587}
      MAIL_USER: ${MAIL_USER}
      MAIL_PASS: ${MAIL_PASS}
      BATCH_SIZE: 1000
      CONCURRENT_BATCHES: 5
      CORS_DOMAINS: ${CLIENT_HOST:-http://localhost:3000}
      API_HOST: http://api:1335
      CLIENT_HOST: ${CLIENT_HOST:-http://localhost:3000}
      BOUNCE_API_KEY: ${BOUNCE_API_KEY:-}
    depends_on:
      db:
        condition: service_healthy
    networks:
      - campster-network

  ui:
    image: abhishekbhat18/campster-ui:latest
    # build:
    #   context: ./packages/client   # uncomment to build from source
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      NEXT_PUBLIC_API_URL: ${NEXT_PUBLIC_API_URL:-http://localhost:1335}
    depends_on:
      - api
    networks:
      - campster-network

volumes:
  postgres_data:

networks:
  campster-network:
    driver: bridge
```

**Step 3 — Start everything:**

```bash
docker compose up -d
docker compose logs -f api     # follow API logs
```

The UI is available at `http://localhost:3000`.

**Update to a new version:**

```bash
docker compose pull
docker compose up -d
```

**Stop and remove containers (data is preserved in the volume):**

```bash
docker compose down
```

**Wipe all data including the database:**

```bash
docker compose down -v
```

---

### Building Docker Images manually

Build and run just the API:

```bash
# Build
cd packages/api
docker build -t campster-api:latest .

# Run (replace env vars with your values)
docker run -d \
  --name campster-api \
  -p 1335:1335 \
  -e NODE_ENV=production \
  -e PORT=1335 \
  -e JWT_SECRET=change-me \
  -e DB_HOST=your-db-host \
  -e DB_PORT=5432 \
  -e DB_NAME=campster \
  -e DB_USER=campster \
  -e DB_PASSWORD=change-me \
  -e MAIL_HOST=smtp.example.com \
  -e MAIL_PORT=587 \
  -e MAIL_USER=you@example.com \
  -e MAIL_PASS=yourpassword \
  -e CORS_DOMAINS=http://localhost:3000 \
  -e API_HOST=http://localhost:1335 \
  -e CLIENT_HOST=http://localhost:3000 \
  campster-api:latest
```

Build and run just the UI:

```bash
# Build (NEXT_PUBLIC_API_URL is baked into the image at build time)
cd packages/client
docker build \
  --build-arg NEXT_PUBLIC_API_URL=http://your-api-host:1335 \
  -t campster-ui:latest .

# Run
docker run -d \
  --name campster-ui \
  -p 3000:3000 \
  campster-ui:latest
```

Build both from the repo root using Make:

```bash
make docker-build-api
```

---

### Kubernetes / any container runtime

The containers are stateless — persistence is entirely in PostgreSQL. For production Kubernetes:

| What | Recommendation |
|---|---|
| Database | External managed Postgres (RDS, Cloud SQL, Supabase, Neon) — do not run Postgres as an in-cluster deployment in production |
| Secrets | Store `JWT_SECRET`, DB credentials, SMTP password in Kubernetes Secrets or a secrets manager; never bake them into images |
| Migrations | Run migrations as an init container or a one-off Job before deploying new API pods |
| SMTP | Use a transactional email service (SES, Postmark, Mailgun) for reliability at scale |

Example init container snippet:

```yaml
initContainers:
  - name: migrate
    image: abhishekbhat18/campster-api:latest
    command: ["yarn", "seed"]
    env:
      - name: DB_HOST
        valueFrom:
          secretKeyRef: { name: campster-secrets, key: db-host }
      # ... other DB env vars
```

---

## Running Tests

```bash
# All unit tests
cd packages/api && yarn test

# Watch mode
cd packages/api && yarn test:watch

# Coverage report
cd packages/api && yarn test:cov

# End-to-end tests
cd packages/api && yarn test:e2e
```

---

## Project Structure

```
campster/
├── packages/
│   ├── api/                     # NestJS backend (port 1335)
│   │   ├── src/
│   │   │   ├── app.module.ts    # Root module — wires all feature modules
│   │   │   ├── main.ts          # Bootstrap — CORS, validation, cookie parser
│   │   │   ├── config/          # configuration() factory (env → typed config)
│   │   │   ├── migrations/      # Kysely migration files (numbered, append-only)
│   │   │   ├── seed.ts          # Runs migrateToLatest() + seeds roles/admin user
│   │   │   └── modules/
│   │   │       ├── auth/        # JWT login, session cookies
│   │   │       ├── user/        # User accounts
│   │   │       ├── project/     # Projects (workspaces per team)
│   │   │       ├── campaign/    # Email campaign CRUD + scheduling
│   │   │       ├── contact/     # Individual contacts
│   │   │       ├── contact-list/# Mailing lists
│   │   │       ├── email/       # Email sending (nodemailer) + BullMQ processor
│   │   │       ├── email-template/ # Template management
│   │   │       ├── transactional/  # Transactional email API
│   │   │       ├── analytics/   # Open/click/bounce tracking
│   │   │       ├── bounce/      # Bounce webhook handler
│   │   │       ├── role/        # RBAC roles
│   │   │       └── database/    # Kysely connection + migration runner
│   │   ├── Dockerfile
│   │   └── package.json
│   └── client/                  # Next.js 14 frontend (port 3000)
│       ├── src/
│       │   ├── app/             # Next.js App Router pages
│       │   ├── components/      # Shared UI components (shadcn/ui + Radix)
│       │   ├── lib/             # API client, auth helpers
│       │   └── utils/           # Utilities
│       ├── Dockerfile
│       └── package.json
├── api-endpoints/               # Bruno API collection (import into Bruno)
├── haraka/                      # Optional self-hosted SMTP (Haraka)
├── docker-compose.yaml          # Self-hosting starting point
├── makefile                     # Convenience targets
└── package.json                 # Yarn workspaces root
```

---

## Runbook

Complete sequence from zero to a running local instance (copy-paste ready):

```bash
# 0. Start a local Postgres instance (skip if you already have one)
docker run -d \
  --name campster-db \
  -e POSTGRES_DB=campster \
  -e POSTGRES_USER=campster \
  -e POSTGRES_PASSWORD=campster \
  -p 5432:5432 \
  postgres:16-alpine

# 1. Clone and install
git clone https://github.com/Abhi-Bhat18/campster.git
cd campster
yarn install

# 2. Configure the API
cp packages/api/.env.development packages/api/.env
# Edit packages/api/.env — at minimum set DB credentials and JWT_SECRET
# Default DB values (campster/campster) match the Docker container above

# 3. Configure the client (defaults work for local dev)
cp packages/client/.env packages/client/.env.local

# 4. Run migrations and seed data
cd packages/api && yarn seed && cd ../..

# 5. Start the API (leave running in this terminal)
cd packages/api && yarn start:dev &

# 6. Start the client (leave running in a second terminal)
cd packages/client && yarn dev &

# 7. Open the app
open http://localhost:3000

# 8. Run API tests
cd packages/api && yarn test
```

### Self-hosting quick start (Docker Compose)

```bash
# 1. Create secrets
cat > .env <<'EOF'
JWT_SECRET=$(openssl rand -hex 32)
POSTGRES_DB=campster
POSTGRES_USER=campster
POSTGRES_PASSWORD=$(openssl rand -hex 16)
MAIL_HOST=smtp.example.com
MAIL_PORT=587
MAIL_USER=you@example.com
MAIL_PASS=yourpassword
NEXT_PUBLIC_API_URL=http://localhost:1335
EOF

# 2. Pull and start
docker compose up -d

# 3. Check logs
docker compose logs -f api

# 4. Open the app
open http://localhost:3000
```
