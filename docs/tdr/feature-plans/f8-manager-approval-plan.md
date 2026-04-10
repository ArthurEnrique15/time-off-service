# F8 — Manager Approval: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `PATCH /time-off-requests/:id/approve` and `PATCH /time-off-requests/:id/reject` endpoints enabling managers to approve or reject PENDING time-off requests.

**Architecture:** A thin controller delegates to `TimeOffRequestService`, which runs a single Prisma transaction: update the request status + call the appropriate balance InTx method (`confirmDeductionInTx` or `releaseReservationInTx`). After the transaction commits, a `BalanceAuditService.recordEntry()` call logs the outcome. Non-PENDING requests return 409; missing requests return 404.

**Tech Stack:** NestJS, Prisma/SQLite, `class-validator` (already installed), BalanceService (F2), BalanceAuditService (F3).

**Worktree:** `.worktrees/f8-manager-approval` on branch `main`

**Spec:** `docs/tdr/specs/f8-manager-approval-spec.md`

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `src/http/dtos/approve-reject-time-off-request.dto.ts` | Optional `actorId` request body DTO |
| Create | `src/http/dtos/approve-reject-time-off-request.dto.spec.ts` | DTO unit tests |
| Modify | `src/core/services/time-off-request.service.ts` | Add `approve()` and `reject()` methods |
| Modify | `src/core/services/time-off-request.service.spec.ts` | Unit tests for new service methods |
| Modify | `src/http/controllers/time-off-request.controller.ts` | Add `PATCH /:id/approve` and `PATCH /:id/reject` routes |
| Modify | `src/http/controllers/time-off-request.controller.spec.ts` | Controller unit tests for new routes |
| Modify | `test/integration/time-off-request.integration-spec.ts` | Integration tests for both endpoints |
| Modify | `stryker.config.mjs` | Ensure service mutations are covered |

---

## Task 1: Add `approve-reject-time-off-request.dto.ts`

**Files:**
- Create: `src/http/dtos/approve-reject-time-off-request.dto.ts`
- Create: `src/http/dtos/approve-reject-time-off-request.dto.spec.ts`

- [ ] Write unit tests for the DTO (optional string, missing field, non-string value).
- [ ] Verify the tests fail for the right reason.
- [ ] Implement the DTO with `@IsOptional()` and `@IsString()` on `actorId`.
- [ ] Verify the tests pass.
- [ ] Run `npm test -- --testPathPattern=approve-reject`.

---

## Task 2: Add `approve()` to `TimeOffRequestService`

**Files:**
- Modify: `src/core/services/time-off-request.service.ts`
- Modify: `src/core/services/time-off-request.service.spec.ts`

- [ ] Write failing unit tests: happy path, not found (404), non-PENDING (409), with `actorId`.
- [ ] Verify the tests fail for the right reason.
- [ ] Implement `approve(id, dto)`: fetch request → 404 if missing → 409 if not PENDING → Prisma `$transaction` (update status to APPROVED + `confirmDeductionInTx`) → `recordEntry` with `APPROVAL_DEDUCTION` → return updated request.
- [ ] Verify the tests pass.
- [ ] Run `npm test -- --testPathPattern=time-off-request.service`.

---

## Task 3: Add `reject()` to `TimeOffRequestService`

**Files:**
- Modify: `src/core/services/time-off-request.service.ts`
- Modify: `src/core/services/time-off-request.service.spec.ts`

- [ ] Write failing unit tests: happy path, not found (404), non-PENDING (409), with `actorId`.
- [ ] Verify the tests fail for the right reason.
- [ ] Implement `reject(id, dto)`: fetch request → 404 if missing → 409 if not PENDING → Prisma `$transaction` (update status to REJECTED + `releaseReservationInTx`) → `recordEntry` with `RESERVATION_RELEASE` → return updated request.
- [ ] Verify the tests pass.
- [ ] Run `npm test -- --testPathPattern=time-off-request.service`.

---

## Task 4: Add controller routes

**Files:**
- Modify: `src/http/controllers/time-off-request.controller.ts`
- Modify: `src/http/controllers/time-off-request.controller.spec.ts`

- [ ] Write failing unit tests: `approve()` delegates to service; `reject()` delegates to service; both return 200.
- [ ] Verify the tests fail for the right reason.
- [ ] Add `@Patch(':id/approve')` and `@Patch(':id/reject')` methods with `@Body() dto: ApproveRejectTimeOffRequestDto`.
- [ ] Verify the tests pass.
- [ ] Run `npm test -- --testPathPattern=time-off-request.controller`.

---

## Task 5: Integration tests

**Files:**
- Modify: `test/integration/time-off-request.integration-spec.ts`

- [ ] Write failing integration tests for `PATCH /time-off-requests/:id/approve` (happy path, 404, 409 for non-PENDING, with `actorId`).
- [ ] Write failing integration tests for `PATCH /time-off-requests/:id/reject` (happy path, 404, 409 for non-PENDING, with `actorId`).
- [ ] Verify the tests fail for the right reason.
- [ ] Verify all integration tests pass after Tasks 2–4 are complete.
- [ ] Run the full integration suite.

---

## Task 6: Mutation testing

**Files:**
- Modify: `stryker.config.mjs`

- [ ] Confirm `time-off-request.service.ts` is included in Stryker mutation targets.
- [ ] Run Stryker on the service file: `npx stryker run`.
- [ ] Review surviving mutants and add missing assertions or tests as needed.
- [ ] Run the full test suite one final time to confirm everything is green.
