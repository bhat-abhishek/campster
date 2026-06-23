<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="200" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://coveralls.io/github/nestjs/nest?branch=master" target="_blank"><img src="https://coveralls.io/repos/github/nestjs/nest/badge.svg?branch=master#9" alt="Coverage" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Installation

```bash
$ yarn install
```

## Running the app

```bash
# development
$ yarn run start

# watch mode
$ yarn run start:dev

# production mode
$ yarn run start:prod
```

## Test

```bash
# unit tests
$ yarn run test

# e2e tests
$ yarn run test:e2e

# test coverage
$ yarn run test:cov
```

## RUNBOOK — auth unit tests

Exact commands to install, run, and test the `api` package. Run from the
**repository root** unless noted otherwise.

### Install

```bash
# Installs every workspace (api + client) via yarn workspaces and wires up the
# husky git hooks. Run once after cloning.
yarn install
```

### Run the unit tests

```bash
# All api unit tests (*.spec.ts under packages/api/src)
yarn test:api

# Just the auth module suites
cd packages/api && npx jest auth

# Watch mode while developing
yarn test:api:watch

# With coverage report (written to packages/api/coverage)
yarn test:api:cov
```

`yarn test` (no suffix) runs the unit tests for **every** workspace — this is
exactly what the `pre-commit` hook executes, so a green `yarn test` means the
commit will not be blocked.

### Lint

```bash
# Lint + auto-fix the api package (also what lint-staged runs on commit)
yarn lint:api
```

### What is covered

The auth module is exercised by three co-located suites plus shared test
doubles:

| File | Scope |
| --- | --- |
| `src/modules/auth/auth.service.spec.ts` | `AuthServices` business logic — sign-up validation, sign-in/credential checks, token refresh, forgot/reset password, sign-out. |
| `src/modules/auth/auth.controller.spec.ts` | `AuthController` HTTP glue — cookie handling, delegation to the service, refresh-token expiry fallback. |
| `src/modules/auth/auth.guard.spec.ts` | `AuthGuard` — missing/invalid token rejection and payload attachment. |
| `src/modules/auth/testing/auth.mocks.ts` | Reusable jest test doubles + fixtures shared by the suites (no real DB, JWT secret, or bcrypt binding). |

All collaborators (DB-backed services, `JwtService`, `bcrypt`, the filesystem,
and Handlebars) are mocked, so the suites are fast and hermetic.

### Pre-commit hook

`.husky/pre-commit` runs `npx lint-staged` (lints staged files) followed by
`yarn test` (all workspaces). Both must pass before a commit is accepted.

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://kamilmysliwiec.com)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](LICENSE).
