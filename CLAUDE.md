# Campster — Developer Reference

Campster is a self-hostable, open-source email marketing platform. Companies use it to run bulk campaigns, manage contacts, send transactional emails, and track analytics — all with full data ownership.

**Stack:** NestJS 10 (API, port 1335) · Next.js 14 App Router (UI, port 3000) · PostgreSQL 14+ · Kysely ORM · Nodemailer / AWS SES · Redux Toolkit + RTK Query · shadcn/ui + Radix

---

## Runbook

### Install

```bash
# Node.js 20+, Yarn 1.x, and PostgreSQL 14+ are required.

# Start a local PostgreSQL instance (Docker, no local install needed)
docker run -d \
  --name campster-db \
  -e POSTGRES_DB=campster \
  -e POSTGRES_USER=campster \
  -e POSTGRES_PASSWORD=campster \
  -p 5432:5432 \
  postgres:16-alpine

# Clone and install all dependencies (both packages via Yarn workspaces)
git clone https://github.com/Abhi-Bhat18/campster.git
cd campster
yarn install

# Configure the API environment
cp packages/api/.env.development packages/api/.env
# Edit packages/api/.env — set DB credentials and JWT_SECRET at minimum
# Default DB values (campster/campster) match the Docker container above

# Configure the client (defaults work for local dev)
cp packages/client/.env packages/client/.env.local
```

### Migrate and seed

```bash
# Run all pending migrations + insert seed roles/admin user
cd packages/api && yarn seed && cd ../..
```

This must be done before the API can start. The seed script runs `migrateToLatest()` then inserts seed roles and an admin user.

### Run

```bash
# Terminal 1 — API (http://localhost:1335, hot-reload)
cd packages/api && yarn start:dev

# Terminal 2 — UI (http://localhost:3000, hot-reload)
cd packages/client && yarn dev
```

Or via Make from the repo root:

```bash
make dev          # API in watch mode
make build-api    # compile API
make build-client # compile client
```

### Test

```bash
# All tests (both packages)
yarn test

# API only
yarn test:api                     # unit tests
yarn test:api:watch               # watch mode
yarn test:api:cov                 # coverage
cd packages/api && yarn test:e2e  # E2E (requires running DB)

# Client only
yarn test:client
yarn test:client:watch
yarn test:client:cov
```

### Lint

```bash
yarn lint           # both packages
yarn lint:api       # NestJS (ESLint + Prettier, auto-fixes)
yarn lint:client    # Next.js (eslint-config-next)
```

### Database migrations

```bash
# Apply all pending migrations (+ seed)
cd packages/api && yarn seed

# Roll back the most recent migration
cd packages/api && npx ts-node --files -r tsconfig-paths/register src/migrate-down.ts

# Add a new migration: create packages/api/src/migrations/<N+1>_description.ts
# and implement up/down using Kysely's schema builder, then run yarn seed.
```

---

## Project Structure

```
campster/
├── packages/
│   ├── api/                     # NestJS backend (port 1335)
│   │   ├── src/
│   │   │   ├── app.module.ts    # Root module — registers all feature modules
│   │   │   ├── main.ts          # Bootstrap: CORS, helmet, cookie-parser, ValidationPipe
│   │   │   ├── config/          # configuration() factory (env vars → typed config object)
│   │   │   ├── migrations/      # Kysely migration files (numbered, append-only)
│   │   │   ├── schemas/         # Kysely table interfaces (source of truth for DB types)
│   │   │   ├── middlewares/     # NestJS middleware (logger)
│   │   │   ├── seed.ts          # migrateToLatest() + seed roles + admin user
│   │   │   └── modules/
│   │   │       ├── auth/        # JWT login/signup, session cookies, guards, refresh
│   │   │       ├── user/        # User account CRUD
│   │   │       ├── project/     # Projects (team workspaces)
│   │   │       ├── project-access/ # Project membership + ProjectAccessGuard
│   │   │       ├── campaign/    # Bulk email campaigns + cron-based processor
│   │   │       ├── contact/     # Individual contact records
│   │   │       ├── contact-list/# Mailing lists, CSV import
│   │   │       ├── email/       # nodemailer/SES sending, click/open tracking
│   │   │       ├── email-template/ # Drag-and-drop template CRUD
│   │   │       ├── transactional/  # API-key-authenticated transactional sends + cron
│   │   │       ├── analytics/   # Opens, clicks, bounces aggregation
│   │   │       ├── bounce/      # Bounce webhook handler
│   │   │       ├── role/        # RBAC role catalogue
│   │   │       ├── ses/         # Per-project AWS SES config (AES-256-GCM encrypted)
│   │   │       └── database/    # Kysely connection singleton + migration runner
│   │   ├── Dockerfile
│   │   └── package.json
│   └── client/                  # Next.js 14 App Router frontend (port 3000)
│       ├── src/
│       │   ├── app/             # Route segments (App Router)
│       │   │   ├── (auth)/      # Protected pages (wrapped by AuthenticatedLayout)
│       │   │   └── (public)/    # Public pages (login, signup)
│       │   ├── components/      # Shared UI (shadcn/ui + Radix primitives)
│       │   ├── layouts/         # AuthenticatedLayout, AuthCheckLayout
│       │   ├── lib/             # Redux store, RTK Query slices, typed hooks
│       │   └── utils/           # isUserAuthorized() permission helper
│       ├── Dockerfile
│       └── package.json
├── api-endpoints/               # Bruno API collection (import into Bruno for manual testing)
├── haraka/                      # Optional self-hosted SMTP via Haraka
├── docker-compose.yaml          # Self-hosting: Postgres + API + UI in one command
├── makefile                     # Convenience build targets
└── package.json                 # Yarn workspaces root + Husky / lint-staged config
```

---

## Authentication

Authentication is entirely HTTP-layer — it lives in `packages/api/src/modules/auth/`.

### Flow

1. **Sign-up / Sign-in** — `POST /auth/sign-up` and `POST /auth/sign-in` (`auth.controller.ts` → `auth.service.ts`). On success, the API sets an `httpOnly`, `sameSite: strict` cookie named `token` containing a signed JWT (`JWT_SECRET`, default expiry `JWT_EXPIRES_IN=7d`).

2. **Session verification** — Every protected route applies `AuthGuard` (`auth.guard.ts`). It reads `req.cookies.token`, calls `jwtService.verifyAsync`, and attaches the decoded payload to `request.user`. If the cookie is absent or invalid, it throws `UnauthorizedException`.

3. **Token refresh** — `GET /auth/refresh` re-issues a new JWT. If the existing token is expired (but otherwise valid), the payload is decoded without verification and a fresh token is issued.

4. **Sign-out** — `GET /auth/sign-out` clears the cookie.

### Key files

| File | Purpose |
|---|---|
| `modules/auth/auth.guard.ts` | `AuthGuard` — verifies JWT cookie, attaches `request.user` |
| `modules/auth/auth.service.ts` | `AuthServices` — signUp, signIn, refreshAccessToken business logic |
| `modules/auth/auth.controller.ts` | HTTP routes: sign-up, sign-in, sign-out, refresh |
| `modules/auth/tokens.ts` | JWT helpers |
| `modules/auth/passwords.ts` | bcrypt password hashing |

### Client-side auth

- Redux slice at `packages/client/src/lib/features/auth/authSlice.ts` holds `{ isLoggedIn, user, permissions, defaultProject }`.
- `useCheckLoginQuery` (RTK Query) is called on mount to rehydrate session from the API.
- `AuthenticatedLayout` wraps every protected page — it redirects to `/login` when `isLoggedIn` is false.
- `AuthCheckLayout` is used on public pages — it redirects to the dashboard when already logged in.

---

## Authorization

### Role-based access control (RBAC)

Permissions follow the pattern `<resource>:<action>`:

| Resources | Actions |
|---|---|
| `organization`, `project`, `campaigns`, `contact-lists`, `transactionals`, `analytics`, `templates` | `create`, `read`, `update`, `delete`, `manage` |

`manage` is a wildcard that implies all actions on that resource.

**Seed roles** (defined in `modules/seed/seed.data.ts`):

| Role | Key permissions |
|---|---|
| `owner` | `organization:manage`, `project:manage`, and `manage` on all resources |
| `admin` | `manage` on all resources except organization |
| `member` | `read`/`create`/`update` on campaigns, contacts, templates |
| `viewer` | `read` on all resources |

### ProjectAccessGuard

`modules/project-access/projectAccessGuard.ts` — applied to all project-scoped routes.

1. Reads `x-project-id` from the request header (or `body.project_id`).
2. Looks up the calling user's `project_accesses` row (user + project combo).
3. Derives required permissions from the URL path segment and HTTP method (`GET→read`, `POST→create`, `PATCH→update`, `DELETE→delete`).
4. Grants access if the user holds either `<feature>:manage` or `<feature>:<method-permission>`.

### API key guard (transactional emails)

`modules/transactional/api-key.guard.ts` — used instead of `AuthGuard` for the transactional send endpoint.

- Reads `x-api-key` header.
- Validates against the `api_keys` table (keyed by project).
- Attaches `project_id` to the request on success.

### Client-side permission checks

```ts
// packages/client/src/utils/permissionCheck.tsx
isUserAuthorized(permissions, 'campaigns', 'create')  // → boolean
```

Use this utility before rendering action buttons. The `permissions` map comes from the Redux auth slice.

---

## Key Modules

### Campaign processor

`modules/campaign/campaign.service.ts` — `@Cron(EVERY_10_SECONDS)` scans for campaigns with `status = 'scheduled'` and `scheduled_at <= now()`, then processes them in parallel batches:

- `BATCH_SIZE` (env, default 1) contacts per batch
- `CONCURRENT_BATCHES` (env, default 5) batches in parallel
- Status transitions: `scheduled → in_progress → sent` (or `failed`)
- Each sent email creates an `emails` row for tracking

### Transactional email processor

`modules/transactional/transactional.services.ts` — `@Cron(EVERY_MINUTE)` drains queued transactional email records and dispatches them via `EmailService`.

### Email service

`modules/email/email.service.ts` — wraps nodemailer. Sends via project-specific SES config if present, otherwise falls back to global SMTP env vars. Handles click/open tracking via JWT-signed redirect URLs.

### SES configuration

`modules/ses/` — per-project AWS SES config stored in `ses_configs` table. Credentials (`access_key_id`, `secret_access_key`, SMTP user/pass) are encrypted with AES-256-GCM using `SES_ENCRYPTION_KEY` before persisting. Three auth methods: `iam_credentials`, `environment`, `ses_smtp`.

---

## Environment Variables

### API (`packages/api/.env`)

| Variable | Required | Default | Notes |
|---|---|---|---|
| `PORT` | No | `1335` | API listen port |
| `NODE_ENV` | No | `development` | Set to `production` in prod |
| `JWT_SECRET` | Yes | — | At least 32 random chars |
| `JWT_EXPIRES_IN` | No | `7d` | JWT expiry duration |
| `DB_HOST` | Yes | — | PostgreSQL host |
| `DB_PORT` | No | `5432` | PostgreSQL port |
| `DB_NAME` | Yes | — | Database name |
| `DB_USER` | Yes | — | Database user |
| `DB_PASSWORD` | Yes | — | Database password |
| `MAIL_HOST` | Yes | — | SMTP server hostname |
| `MAIL_PORT` | No | `587` | SMTP port |
| `MAIL_USER` | Yes | — | SMTP username |
| `MAIL_PASS` | Yes | — | SMTP password |
| `BATCH_SIZE` | No | `1000` | Contacts per campaign batch |
| `CONCURRENT_BATCHES` | No | `5` | Parallel batches per campaign |
| `CORS_DOMAINS` | Yes | — | Comma-separated allowed origins |
| `API_HOST` | No | — | Used in email tracking links |
| `CLIENT_HOST` | No | — | Used in redirect URLs |
| `BOUNCE_API_KEY` | No | — | Secret for bounce webhook |
| `SES_ENCRYPTION_KEY` | No | — | 32-byte hex; required to store SES credentials |

### Client (`packages/client/.env.local`)

| Variable | Default | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:1335` | Browser-facing API base URL |

---

## Conventions and Rules

### Adding a new API module

1. Create `packages/api/src/modules/<name>/` with `*.module.ts`, `*.service.ts`, `*.controller.ts`, and DTO files.
2. Register the module in `app.module.ts`.
3. Protect routes with `@UseGuards(AuthGuard)` (session) and/or `@UseGuards(ProjectAccessGuard)` (project-scoped).
4. Use `DatabaseService.getDb()` to get the Kysely instance; call `this.db = this.databaseService.getDb()` in `onModuleInit()`.
5. Define Kysely table types in `packages/api/src/schemas/<name>.schema.ts`.

### Adding a DB table

1. Add the Kysely interface to `packages/api/src/schemas/<name>.schema.ts`.
2. Add it to the `Database` interface in `modules/database/database.types.ts`.
3. Create a new migration file `packages/api/src/migrations/<N+1>_<description>.ts` implementing `up` and `down`.
4. Run `cd packages/api && yarn seed`.

Never use `create_all` / schema sync — migrations are the single source of truth.

### Request validation

Use class-validator decorators on DTO classes. `ValidationPipe` is registered globally in `main.ts` — no per-route setup needed.

### Guards

- `AuthGuard` — required on all authenticated routes; reads `token` cookie.
- `ProjectAccessGuard` — required on project-scoped resources; requires `x-project-id` header.
- `APIKeyGuard` — used on the transactional send endpoint; reads `x-api-key` header.

Apply guards with `@UseGuards(...)` on the controller or individual method.

### IDs

Use `ulid` (imported from the `ulid` package) for new primary keys. All primary keys are `varchar`.

### Testing

- Unit tests live next to source as `*.spec.ts`.
- Mock dependencies using the helper factories in `modules/auth/testing/auth.mocks.ts` (and similar per-module).
- Never test implementation details — test observable behavior through the public API.
- E2E tests in `packages/api/test/` use `@nestjs/testing` + Supertest and require a live database.

### Client state

- Server calls go through RTK Query API slices in `packages/client/src/lib/features/*/`.
- Local UI state uses React state; global shared state uses Redux slices.
- Always check permissions with `isUserAuthorized(permissions, resource, action)` before rendering write actions.

### Pre-commit hooks

Husky runs lint-staged (ESLint on staged `.ts`/`.tsx` files) and the full unit test suite before every commit. Do not skip with `--no-verify` except in genuine emergencies.
