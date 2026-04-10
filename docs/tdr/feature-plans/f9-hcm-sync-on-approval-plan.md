# F9 — HCM Sync on Approval Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents are available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move HCM submission from request creation to manager approval while preserving local reservation behavior and making approval outcomes explicit.

**Architecture:** `TimeOffRequestService.create()` becomes local-only. `TimeOffRequestService.approve()` calls HCM first and then applies one of three local branches: approval success, business rejection, or operational failure. Audit trail entries continue to capture balance changes, and a new zero-delta `HCM_SYNC` entry captures external sync outcomes.

**Tech Stack:** NestJS, Prisma/SQLite, Jest, Supertest, date-fns, mock HCM server.

---

### Task 1: Update TDR Documents

**Files:**
- Create: `docs/tdr/specs/f9-hcm-sync-on-approval-spec.md`
- Create: `docs/tdr/feature-plans/f9-hcm-sync-on-approval-plan.md`
- Create: `docs/tdr/agent-plans/2026-04-10-f9-hcm-sync-on-approval-agent-plan.md`
- Modify: `docs/tdr/master.md`
- Modify: `docs/tdr/specs/f1-domain-models-spec.md`
- Modify: `docs/tdr/specs/f3-balance-audit-trail-spec.md`
- Modify: `docs/tdr/specs/f5-time-off-request-create-spec.md`
- Modify: `docs/tdr/specs/f8-manager-approval-spec.md`

- [ ] Save the F9 spec, implementation plan, and agent plan in `docs/tdr/`.
- [ ] Add F9 links and an `F9 Design Decisions` section to `docs/tdr/master.md`.
- [ ] Update the F1/F3/F5/F8 specs so they no longer contradict the F9 flow.

### Task 2: Add Failing Unit Tests For Audit Reason Support

**Files:**
- Modify: `src/core/services/balance-audit.service.spec.ts`

- [ ] Add failing tests proving `HCM_SYNC` is a valid reason for audit writes and filters.
- [ ] Run the focused spec to verify the new tests fail for the right reason.
- [ ] Implement the minimal audit-reason change.
- [ ] Run the focused spec again to verify it passes.

### Task 3: Add Failing Unit Tests For Local-Only Request Creation

**Files:**
- Modify: `src/core/services/time-off-request.service.spec.ts`
- Modify: `src/http/controllers/time-off-request.controller.spec.ts`

- [ ] Add failing tests proving `create()` no longer calls `submitTimeOff()` and does not persist an HCM ID on initial creation.
- [ ] Run the focused request unit specs to verify the failures are caused by the old behavior.
- [ ] Implement the minimum `create()` changes.
- [ ] Re-run the focused request unit specs to verify the new create contract passes.

### Task 4: Add Failing Unit Tests For Approval Sync Branches

**Files:**
- Modify: `src/core/services/time-off-request.service.spec.ts`
- Modify: `src/http/controllers/time-off-request.controller.spec.ts`

- [ ] Add failing tests for approval success, HCM business rejection, HCM operational failure, and reject remaining local-only.
- [ ] Run the focused approval unit specs to verify the failures match the missing behavior.
- [ ] Implement the minimum `approve()` changes, including `hcmRequestId` persistence and `HCM_SYNC` audit logging.
- [ ] Re-run the focused approval unit specs to verify they pass.

### Task 5: Add Failing Integration Tests

**Files:**
- Modify: `test/support/mock-hcm-server.ts`
- Modify: `test/integration/time-off-request.integration-spec.ts`

- [ ] Add failing POST integration assertions for local-only creation (`hcmRequestId` null, no create-time HCM rejection behavior).
- [ ] Add failing approve integration assertions for HCM success, HCM business rejection, and HCM operational failure.
- [ ] Extend the mock HCM support only as needed to force each approval outcome.
- [ ] Run the integration suite and verify the failures are due to the old implementation.
- [ ] Implement the minimum integration-facing changes and re-run the suite until green.

### Task 6: Verify Broader Quality Gates

**Files:**
- Modify: `stryker.config.mjs` (only if mutation target coverage needs adjustment)

- [ ] Run the full unit test suite.
- [ ] Run the full integration suite.
- [ ] Run `npm run lint`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run stryker`.
- [ ] Review any surviving mutants and add minimal assertions if needed.
