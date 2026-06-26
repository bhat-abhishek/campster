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
- [Linting](#linting)
- [Pre-commit Hooks](#pre-commit-hooks)
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
- **Multiple email providers** — SMTP, AWS SES, or SendGrid per project — configured per-project with encrypted credential storage

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

# ── AWS SES (optional — per-project config stored encrypted in DB) ─────────────
SES_ENCRYPTION_KEY=<32-byte-hex-key>     # required to use per-project AWS SES
# AWS_REGION=us-east-1                   # default region for environment-auth method

# ── SendGrid (optional — per-project config stored encrypted in DB) ────────────
SENDGRID_ENCRYPTION_KEY=<32-byte-hex-key>  # required to use per-project SendGrid
```

### Client — `packages/client/.env.local`

```bash
# URL the browser uses to reach the API
NEXT_PUBLIC_API_URL=http://localhost:1335
```

---

## AWS SES Configuration

Each project can optionally use AWS SES instead of the global SMTP server. Per-project SES configs are stored encrypted in the database.

### Prerequisites

1. **Set the encryption key** (required to store any SES credentials):
   ```bash
   # Generate a random key
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   # Add to your .env:
   SES_ENCRYPTION_KEY=<generated-value>
   ```

2. **Install the AWS SDK** (included as a dependency, runs automatically with `yarn install`):
   ```bash
   cd packages/api && yarn install
   ```

3. **Run the new migration** so the `ses_configs` table is created:
   ```bash
   cd packages/api && yarn seed
   ```

### Supported Authentication Methods

| Method | Description | Required env vars |
|---|---|---|
| `iam_credentials` | Explicit AWS access key + secret stored encrypted in the database | `SES_ENCRYPTION_KEY` |
| `environment` | Default AWS credential chain (env vars, IAM role, instance profile) | `AWS_REGION` + AWS credentials via env/role |
| `ses_smtp` | SES SMTP endpoint with SMTP username/password (stored encrypted) | `SES_ENCRYPTION_KEY` |

### API Endpoints

All endpoints require authentication (JWT cookie).

#### Save or update a project's SES config

```bash
# IAM credentials method
curl -X POST http://localhost:1335/ses/config \
  -H 'Content-Type: application/json' \
  -d '{
    "project_id": "YOUR_PROJECT_ID",
    "auth_method": "iam_credentials",
    "region": "us-east-1",
    "access_key_id": "AKIAIOSFODNN7EXAMPLE",
    "secret_access_key": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
  }'

# Environment credential chain (uses AWS_ACCESS_KEY_ID / IAM role / etc.)
curl -X POST http://localhost:1335/ses/config \
  -H 'Content-Type: application/json' \
  -d '{
    "project_id": "YOUR_PROJECT_ID",
    "auth_method": "environment",
    "region": "us-east-1"
  }'

# SES SMTP interface
curl -X POST http://localhost:1335/ses/config \
  -H 'Content-Type: application/json' \
  -d '{
    "project_id": "YOUR_PROJECT_ID",
    "auth_method": "ses_smtp",
    "smtp_host": "email-smtp.us-east-1.amazonaws.com",
    "smtp_port": 587,
    "smtp_user": "SMTP_USERNAME_FROM_AWS_CONSOLE",
    "smtp_pass": "SMTP_PASSWORD_FROM_AWS_CONSOLE"
  }'
```

#### Get a project's SES config (credentials are never returned)

```bash
curl http://localhost:1335/ses/config/YOUR_PROJECT_ID
```

#### Remove a project's SES config (falls back to global SMTP)

```bash
curl -X DELETE http://localhost:1335/ses/config/YOUR_PROJECT_ID
```

### How it works

- Campaign emails automatically use the project's SES config if one exists; otherwise fall back to the global SMTP settings.
- Credentials (`access_key_id`, `secret_access_key`, SMTP user/pass) are encrypted with **AES-256-GCM** before being written to the database. The encryption key never leaves your server environment.
- `GET /ses/config/:project_id` returns `has_access_key` / `has_smtp_credentials` boolean flags instead of raw secrets.

---

## SendGrid Configuration

Each project can optionally use SendGrid instead of the global SMTP server or AWS SES. Credentials are stored encrypted in the database, and the API uses SendGrid's SMTP relay under the hood — no additional npm packages are required.

**Priority order:** SES (if configured for the project) → SendGrid (if configured) → global SMTP fallback.

### Prerequisites

1. **Generate a SendGrid API key** in the [SendGrid dashboard](https://app.sendgrid.com/) under **Settings → API Keys**. Grant at minimum *Mail Send* permission.

2. **Set the encryption key** (required to store any SendGrid credentials):
   ```bash
   # Generate a random key
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   # Add to your .env:
   SENDGRID_ENCRYPTION_KEY=<generated-value>
   ```

3. **Run the new migration** so the `sendgrid_configs` table is created:
   ```bash
   cd packages/api && yarn seed
   ```

### Environment Variables

Add to `packages/api/.env`:

```bash
# ── SendGrid (optional — per-project config stored encrypted in DB) ────────────
SENDGRID_ENCRYPTION_KEY=<32-byte-hex-key>
```

### API Endpoints

All endpoints require authentication (JWT cookie).

#### Save or update a project's SendGrid config

```bash
curl -X POST http://localhost:1335/sendgrid/config \
  -H 'Content-Type: application/json' \
  -b 'token=<your-jwt>' \
  -d '{
    "project_id": "YOUR_PROJECT_ID",
    "api_key": "SG.xxxxxxxxxxxxxxxxxxxx",
    "from_email": "noreply@yourdomain.com",
    "from_name": "Your Company"
  }'
```

`from_email` and `from_name` are optional. They are stored as metadata but do not override the `from` field set by the campaign/transactional sender — that is controlled at send time.

#### Get a project's SendGrid config (API key is never returned)

```bash
curl http://localhost:1335/sendgrid/config/YOUR_PROJECT_ID \
  -b 'token=<your-jwt>'
```

Response example:
```json
{
  "id": "01J...",
  "project_id": "YOUR_PROJECT_ID",
  "from_email": "noreply@yourdomain.com",
  "from_name": "Your Company",
  "has_api_key": true,
  "created_at": "2026-01-01T00:00:00.000Z",
  "updated_at": "2026-01-01T00:00:00.000Z"
}
```

#### Remove a project's SendGrid config (falls back to SES or global SMTP)

```bash
curl -X DELETE http://localhost:1335/sendgrid/config/YOUR_PROJECT_ID \
  -b 'token=<your-jwt>'
```

### How it works

- Campaign and transactional emails automatically use the project's SendGrid config when one exists; otherwise the system falls through to SES, then global SMTP.
- Emails are sent via the **SendGrid SMTP relay** (`smtp.sendgrid.net:587`) using your API key as the password — this means all SendGrid features (open/click tracking, suppression lists, IP warm-up, unsubscribe groups) activated in your SendGrid account apply automatically.
- The API key is encrypted with **AES-256-GCM** before being stored. The encryption key never leaves your server environment.
- `GET /sendgrid/config/:project_id` returns `has_api_key: true` instead of the raw key.

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

### API (NestJS — Jest + `@nestjs/testing`)

Unit tests live next to source files as `*.spec.ts`. E2E tests live in `packages/api/test/`.

```bash
# Run all API unit tests
cd packages/api && yarn test

# Watch mode (re-runs on file change)
cd packages/api && yarn test:watch

# Coverage report (output → packages/api/coverage/)
cd packages/api && yarn test:cov

# End-to-end tests (requires a running DB)
cd packages/api && yarn test:e2e
```

### Client (Next.js — Jest + React Testing Library)

Test files live under `packages/client/src/__tests__/` and match `*.test.{ts,tsx}` or `*.spec.{ts,tsx}`.

```bash
# Run all client unit tests
cd packages/client && yarn test

# Watch mode
cd packages/client && yarn test:watch

# Coverage report (output → packages/client/coverage/)
cd packages/client && yarn test:cov
```

### Run all tests from the repo root

```bash
# Run tests in both packages sequentially
yarn test

# Or target a single package
yarn test:api
yarn test:client
```

---

## Linting

Both packages have ESLint configured. Run linting from the repo root:

```bash
# Lint all packages
yarn lint

# Lint individual packages
yarn lint:api       # NestJS API (ESLint + Prettier)
yarn lint:client    # Next.js client (eslint-config-next)
```

Auto-fix lint errors:

```bash
# API (runs eslint --fix)
cd packages/api && yarn lint

# Client (runs next lint)
cd packages/client && yarn lint
```

---

## Pre-commit Hooks

This project uses [Husky](https://typicode.github.io/husky/) and [lint-staged](https://github.com/lint-staged/lint-staged) to enforce code quality before every commit.

**What runs on `git commit`:**
1. **lint-staged** — ESLint runs on staged TypeScript files in the changed package
2. **Unit tests** — all tests must pass before the commit is accepted

### Setup (one-time, after cloning)

```bash
yarn install    # installs dependencies and runs `husky` via the prepare script
```

That's it — Husky registers the `.husky/pre-commit` hook automatically.

### Skip the hook (emergency only)

```bash
git commit --no-verify -m "your message"
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

# 1. Clone and install (husky pre-commit hooks are registered automatically via `prepare`)
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

# 8. Run API unit tests
cd packages/api && yarn test

# 9. Run client unit tests
cd packages/client && yarn test

# Or run all tests from the repo root
yarn test

# 10. Verify pre-commit hook is active
git commit --allow-empty -m "test: verify pre-commit hook"
# Hook will run lint-staged + yarn test; commit proceeds only if both pass
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
