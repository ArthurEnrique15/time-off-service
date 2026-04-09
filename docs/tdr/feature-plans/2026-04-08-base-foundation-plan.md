# Base Foundation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:executing-plans in environments without subagents. Steps use checkbox syntax for tracking.

**Goal:** Build the runnable repository foundation for future time-off features without implementing business behavior.

**Architecture:** Use a single NestJS service with root source layers, typed env/config wiring, Prisma + SQLite bootstrap, and a health endpoint that proves dependency wiring. Keep the TDR, EARS specs, and agent instructions in-repo so every future feature follows the same flow.

**Tech Stack:** NestJS, Prisma, SQLite, Jest, Supertest, Stryker, ESLint, Prettier

---

### Task 1: Repository Tooling

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.build.json`
- Create: `nest-cli.json`
- Create: `.swcrc`
- Create: `.eslintrc.js`
- Create: `.prettierrc`
- Create: `jest.config.ts`
- Create: `jest.integration.config.ts`
- Create: `stryker.config.mjs`

- [ ] Add the root package scripts and dependency manifests.
- [ ] Mirror the GCB TypeScript, Nest, ESLint, Prettier, and SWC setup where it fits this service.
- [ ] Configure separate Jest entry points for unit and integration tests.
- [ ] Add an initial Stryker configuration targeting one stable base file.

### Task 2: Documentation And Governance

**Files:**
- Create: `AGENTS.md`
- Create: `docs/tdr/master.md`
- Create: `docs/tdr/specs/2026-04-08-base-foundation-spec.md`
- Create: `docs/tdr/feature-plans/2026-04-08-base-foundation-plan.md`
- Create: `docs/tdr/agent-plans/2026-04-08-base-foundation-agent-plan.md`
- Create: `docs/tdr/templates/ears-feature-spec-template.md`
- Create: `docs/tdr/templates/implementation-plan-template.md`
- Create: `docs/tdr/templates/agent-plan-template.md`

- [ ] Document the master architecture decisions in the TDR.
- [ ] Save the current base specification using EARS notation.
- [ ] Save the implementation and agent plans in the repository.
- [ ] Add templates so future features follow the same workflow.

### Task 3: Application Base

**Files:**
- Create: `src/main.ts`
- Create: `src/app.module.ts`
- Create: `src/module/time-off.module.ts`
- Create: `src/module/imports.ts`
- Create: `src/module/providers.ts`
- Create: `src/module/controllers.ts`
- Create: `src/http/controllers/health.controller.ts`
- Create: `src/core/services/health.service.ts`
- Create: `src/shared/config/env/*`
- Create: `src/shared/providers/logger/*`
- Create: `src/shared/providers/hcm/*`
- Create: `src/prisma/*`

- [ ] Write failing unit tests for the env/config layer.
- [ ] Implement the env/config layer and rerun the tests.
- [ ] Write failing unit tests for the health and dependency-check behavior.
- [ ] Implement the minimal Nest application structure to satisfy the tests.
- [ ] Keep the health endpoint operational and non-business.

### Task 4: Integration Harness

**Files:**
- Create: `test/integration/health.integration-spec.ts`
- Create: `test/support/mock-hcm-server.ts`
- Create: `test/support/test-env.ts`

- [ ] Write the failing integration test for app bootstrap and `/health`.
- [ ] Implement the mock HCM server and isolated SQLite test setup.
- [ ] Rerun the integration suite until it passes.

### Task 5: Verification

**Files:**
- Modify: any required files above

- [ ] Run `npm run lint`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run test:cov`.
- [ ] Run `npm run test:integration`.
- [ ] Run `npm run stryker`.
