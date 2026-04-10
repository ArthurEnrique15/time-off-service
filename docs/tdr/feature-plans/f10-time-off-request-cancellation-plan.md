# F10 — Time-Off Request Cancellation: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `PATCH /time-off-requests/:id/cancel` so approved requests can be cancelled with remote-first HCM synchronization, local balance restoration, and audit logging.

**Architecture:** The controller stays thin and delegates to `TimeOffRequestService.cancel()`. The service validates local eligibility, calls HCM cancellation first, then runs one Prisma transaction that marks the request `CANCELLED`, restores the balance through an in-transaction balance helper, and writes a `CANCELLATION_RESTORE` audit entry.

**Tech Stack:** NestJS, Prisma/SQLite, Jest, Supertest, existing HCM mock server, BalanceService, BalanceAuditService.

**Worktree:** `.worktrees/f10-time-off-request-cancellation` on branch `f10-time-off-request-cancellation`

**Spec:** `docs/tdr/specs/f10-time-off-request-cancellation-spec.md`

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Modify | `docs/tdr/master.md` | Link F10 documents and record F10 design decisions |
| Modify | `src/core/services/balance.service.ts` | Add in-transaction balance restoration helper |
| Modify | `src/core/services/balance.service.spec.ts` | Unit tests for in-transaction restore helper |
| Modify | `src/core/services/time-off-request.service.ts` | Add `cancel()` and HCM failure mapping |
| Modify | `src/core/services/time-off-request.service.spec.ts` | Unit tests for cancellation flow |
| Modify | `src/http/controllers/time-off-request.controller.ts` | Add `PATCH /:id/cancel` route |
| Modify | `src/http/controllers/time-off-request.controller.spec.ts` | Controller unit tests for cancel route |
| Modify | `test/integration/time-off-request.integration-spec.ts` | End-to-end cancellation tests |
| Review | `stryker.config.mjs` | Confirm service files remain inside mutation scope |

---

## Task 1: Save the F10 documents and master TDR updates

**Files:**
- Modify: `docs/tdr/master.md`
- Create: `docs/tdr/specs/f10-time-off-request-cancellation-spec.md`
- Create: `docs/tdr/feature-plans/f10-time-off-request-cancellation-plan.md`
- Create: `docs/tdr/agent-plans/2026-04-10-f10-time-off-request-cancellation-agent-plan.md`

- [ ] Save the F10 EARS spec.
- [ ] Save this implementation plan.
- [ ] Save the agent work plan.
- [ ] Update `master.md` with Active Documents links and `## F10 Design Decisions`.
- [ ] Verify the docs render cleanly.

## Task 2: Add `restoreBalanceInTx()` to `BalanceService`

**Files:**
- Modify: `src/core/services/balance.service.ts`
- Modify: `src/core/services/balance.service.spec.ts`

- [ ] Write failing unit tests for `restoreBalanceInTx()` happy path and not-found behavior.
- [ ] Verify the tests fail for the right reason.
- [ ] Implement the minimal in-transaction helper by reusing existing balance lookup logic.
- [ ] Verify the balance service tests pass.
- [ ] Run `npm test -- --runInBand src/core/services/balance.service.spec.ts`.

## Task 3: Add `cancel()` to `TimeOffRequestService`

**Files:**
- Modify: `src/core/services/time-off-request.service.ts`
- Modify: `src/core/services/time-off-request.service.spec.ts`

- [ ] Write failing unit tests for cancellation happy path, `actorId`, not found, ineligible statuses, missing `hcmRequestId`, HCM `NOT_FOUND`, and HCM `UNKNOWN`.
- [ ] Verify the tests fail for the right reason.
- [ ] Implement `cancel(id, actorId?)` with remote-first HCM cancellation and a single Prisma transaction for local updates.
- [ ] Verify the service tests pass.
- [ ] Run `npm test -- --runInBand src/core/services/time-off-request.service.spec.ts`.

## Task 4: Add the cancel controller route

**Files:**
- Modify: `src/http/controllers/time-off-request.controller.ts`
- Modify: `src/http/controllers/time-off-request.controller.spec.ts`

- [ ] Write failing controller tests covering delegation and `actorId` forwarding.
- [ ] Verify the tests fail for the right reason.
- [ ] Add `@Patch(':id/cancel')` and delegate to `timeOffRequestService.cancel(id, dto.actorId)`.
- [ ] Verify the controller tests pass.
- [ ] Run `npm test -- --runInBand src/http/controllers/time-off-request.controller.spec.ts`.

## Task 5: Cover cancellation end-to-end

**Files:**
- Modify: `test/integration/time-off-request.integration-spec.ts`

- [ ] Write failing integration tests for successful cancellation, `actorId`, request-not-found, invalid local statuses, and remote HCM `NOT_FOUND`.
- [ ] Verify the tests fail for the right reason.
- [ ] Implement any missing production behavior required by the integration suite.
- [ ] Verify the full integration file passes.
- [ ] Run `npm run test:integration -- --runInBand test/integration/time-off-request.integration-spec.ts`.

## Task 6: Final verification and mutation coverage

**Files:**
- Review: `stryker.config.mjs`

- [ ] Confirm the changed service files are still included by Stryker's current scope.
- [ ] Run `npm test -- --runInBand`.
- [ ] Run `npm run test:integration`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run stryker`.
