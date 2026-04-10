# F11 Error Handling & Defensive Validation Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global `AllExceptionsFilter` so no unhandled exception ever leaks a raw 500 without structured logging; verify R2 (HCM timeout) and R3 (race-condition docs) are already satisfied.

**Architecture:** A single `@Catch()` NestJS filter is registered in `bootstrap()`. It passes `HttpException`s through unchanged and converts every other throwable into a clean `{ statusCode: 500, message: 'Internal server error' }` response while logging the error structurally.

**Tech Stack:** NestJS `ExceptionFilter`, `HttpAdapterHost`, `@nestjs/testing`, `supertest`

---

## Scope Verification (read before coding)

Before writing any code, confirm the following are already done (no code change needed):

- `HCM_TIMEOUT_MS` is in `env.schema.ts` with default `3000`  
- `EnvConfigParser.getHcmTimeoutMs()` is in `env.config.ts`  
- `HcmClient` has `timeout: this.timeout` on every `customHttpService.request()` call  
- All write endpoints have class-validator DTOs; `ValidationPipe` is in `main.ts`

All four items are confirmed. Proceed to Task 1.

---

## File Map

| Path | Action | Responsibility |
|---|---|---|
| `src/http/filters/all-exceptions.filter.ts` | **Create** | The `AllExceptionsFilter` class |
| `src/http/filters/all-exceptions.filter.spec.ts` | **Create** | Unit tests for the filter |
| `src/main.ts` | **Modify** | Register filter in `bootstrap()` |
| `src/main.spec.ts` | **Modify** | Assert `useGlobalFilters` is called |
| `test/integration/all-exceptions-filter.test.ts` | **Create** | Integration test: raw Error → 500, no stack trace |
| `docs/tdr/feature-plans/f11-error-handling-plan.md` | **Create** | Link from master TDR |
| `docs/tdr/agent-plans/2026-04-10-f11-error-handling-agent-plan.md` | **Create** | This file |
| `docs/tdr/master.md` | **Modify** | Add links to plan + agent plan |

All work is in the `.worktrees/f11-error-handling` worktree on branch `f11-error-handling`.

---

## Task 1 — AllExceptionsFilter (unit)

**Files:**
- Create: `src/http/filters/all-exceptions.filter.ts`
- Create: `src/http/filters/all-exceptions.filter.spec.ts`

- [ ] **Step 1.1 — Write the failing tests**

Create `src/http/filters/all-exceptions.filter.spec.ts`:

```typescript
import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { HttpAdapterHost } from '@nestjs/core';

import { AllExceptionsFilter } from './all-exceptions.filter';

const mockReply = jest.fn();
const mockHttpAdapterHost = {
  httpAdapter: { reply: mockReply },
} as unknown as HttpAdapterHost;

const makeHost = (method = 'GET', url = '/test') =>
  ({
    switchToHttp: () => ({
      getResponse: () => ({}),
      getRequest: () => ({ method, url }),
    }),
  }) as any;

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    filter = new AllExceptionsFilter(mockHttpAdapterHost);
    mockReply.mockClear();
  });

  describe('non-HttpException path', () => {
    it('replies with 500 and a safe body', () => {
      filter.catch(new Error('boom'), makeHost());

      expect(mockReply).toHaveBeenCalledWith(
        expect.anything(),
        { statusCode: 500, message: 'Internal server error' },
        500,
      );
    });

    it('logs method, url, and stack', () => {
      const err = new Error('crash');
      filter.catch(err, makeHost('POST', '/foo'));

      expect(Logger.prototype.error).toHaveBeenCalledWith(
        expect.stringContaining('POST /foo'),
        err.stack,
      );
    });

    it('handles non-Error thrown values', () => {
      filter.catch('string-throw', makeHost());

      expect(mockReply).toHaveBeenCalledWith(
        expect.anything(),
        { statusCode: 500, message: 'Internal server error' },
        500,
      );
    });
  });

  describe('HttpException pass-through', () => {
    it('replies with the original status and response', () => {
      const exception = new HttpException(
        { statusCode: 404, message: 'Not Found', error: 'Not Found' },
        HttpStatus.NOT_FOUND,
      );
      filter.catch(exception, makeHost());

      expect(mockReply).toHaveBeenCalledWith(
        expect.anything(),
        { statusCode: 404, message: 'Not Found', error: 'Not Found' },
        404,
      );
    });

    it('does not call logger for HttpExceptions', () => {
      filter.catch(new HttpException('ok', 200), makeHost());

      expect(Logger.prototype.error).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 1.2 — Run tests and confirm they fail**

```bash
cd .worktrees/f11-error-handling
npm test -- --testPathPattern="all-exceptions.filter.spec" --no-coverage 2>&1 | tail -20
```

Expected: `Cannot find module './all-exceptions.filter'`

- [ ] **Step 1.3 — Create the filter**

Create `src/http/filters/all-exceptions.filter.ts`:

```typescript
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { HttpAdapterHost } from '@nestjs/core';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();

    if (exception instanceof HttpException) {
      httpAdapter.reply(ctx.getResponse(), exception.getResponse(), exception.getStatus());
      return;
    }

    const message = exception instanceof Error ? exception.message : String(exception);
    const stack = exception instanceof Error ? exception.stack : undefined;
    const request = ctx.getRequest<{ method: string; url: string }>();

    this.logger.error(`Unhandled exception on ${request.method} ${request.url}: ${message}`, stack);

    httpAdapter.reply(
      ctx.getResponse(),
      { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Internal server error' },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
```

- [ ] **Step 1.4 — Run tests and confirm green**

```bash
npm test -- --testPathPattern="all-exceptions.filter.spec" --no-coverage 2>&1 | tail -10
```

Expected: `Tests: 5 passed, 5 total`

- [ ] **Step 1.5 — Commit**

```bash
git add src/http/filters/all-exceptions.filter.ts src/http/filters/all-exceptions.filter.spec.ts
git commit -m "feat(f11): add AllExceptionsFilter

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 2 — Register filter in bootstrap

**Files:**
- Modify: `src/main.ts`
- Modify: `src/main.spec.ts`

- [ ] **Step 2.1 — Update main.spec.ts to assert filter registration**

Replace the existing `bootstrap` test (the one that asserts `useGlobalPipes`) to also assert `useGlobalFilters`. The full updated `describe('bootstrap')` block:

```typescript
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

jest.mock('@nestjs/core', () => ({
  NestFactory: {
    create: jest.fn(),
  },
}));

describe('bootstrap', () => {
  it('creates the app and starts listening on the configured port', async () => {
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3000';
    process.env.DATABASE_URL = 'file:./test.db';
    process.env.HCM_API_BASE_URL = 'http://127.0.0.1:4010';
    process.env.HCM_TIMEOUT_MS = '1500';

    const { AppModule } = await import('./app.module');
    const { bootstrap } = await import('./main');
    const app = {
      useGlobalPipes: jest.fn(),
      useGlobalFilters: jest.fn(),
      get: jest.fn().mockImplementation((token: any) => {
        if (typeof token === 'function' && token.name === 'HttpAdapterHost') {
          return { httpAdapter: {} };
        }
        return { get: jest.fn().mockReturnValue(3000) };
      }),
      listen: jest.fn().mockResolvedValue(undefined),
    };

    (NestFactory.create as jest.Mock).mockResolvedValue(app);

    await bootstrap();

    expect(NestFactory.create).toHaveBeenCalledWith(AppModule, { cors: true });
    expect(app.useGlobalPipes).toHaveBeenCalledWith(expect.any(ValidationPipe));
    expect(app.useGlobalFilters).toHaveBeenCalledTimes(1);
    expect(app.listen).toHaveBeenCalledWith(3000);
  });

  it('boots automatically when executed as the main module', async () => {
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3000';
    process.env.DATABASE_URL = 'file:./test.db';
    process.env.HCM_API_BASE_URL = 'http://127.0.0.1:4010';
    process.env.HCM_TIMEOUT_MS = '1500';

    const { runForModule } = await import('./main');
    const app = {
      useGlobalPipes: jest.fn(),
      useGlobalFilters: jest.fn(),
      get: jest.fn().mockImplementation((token: any) => {
        if (typeof token === 'function' && token.name === 'HttpAdapterHost') {
          return { httpAdapter: {} };
        }
        return { get: jest.fn().mockReturnValue(3000) };
      }),
      listen: jest.fn().mockResolvedValue(undefined),
    };

    (NestFactory.create as jest.Mock).mockResolvedValue(app);

    runForModule(module, module);
    await Promise.resolve();

    expect(NestFactory.create).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2.2 — Run main.spec.ts and confirm it fails**

```bash
npm test -- --testPathPattern="main.spec" --no-coverage 2>&1 | tail -15
```

Expected: `app.useGlobalFilters is not a function` (or similar — `useGlobalFilters` not found on mock)

- [ ] **Step 2.3 — Update main.ts**

Replace `src/main.ts` with:

```typescript
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { HttpAdapterHost } from '@nestjs/core';

import { EnvConfigService } from '@shared/config/env';

import { AppModule } from './app.module';
import { AllExceptionsFilter } from './http/filters/all-exceptions.filter';

export async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const httpAdapterHost = app.get(HttpAdapterHost);
  app.useGlobalFilters(new AllExceptionsFilter(httpAdapterHost));

  const envConfigService = app.get(EnvConfigService);
  const port = envConfigService.get('port');

  await app.listen(port);

  return app;
}

export function runForModule(
  currentMain: NodeJS.Module | undefined = require.main,
  currentModule: NodeJS.Module = module,
): void {
  if (currentMain === currentModule) {
    void bootstrap();
  }
}

runForModule();
```

- [ ] **Step 2.4 — Run main.spec.ts and confirm green**

```bash
npm test -- --testPathPattern="main.spec" --no-coverage 2>&1 | tail -10
```

Expected: `Tests: 2 passed, 2 total`

- [ ] **Step 2.5 — Commit**

```bash
git add src/main.ts src/main.spec.ts
git commit -m "feat(f11): register AllExceptionsFilter in bootstrap

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3 — Integration test

**Files:**
- Create: `test/integration/all-exceptions-filter.test.ts`

- [ ] **Step 3.1 — Write the integration test**

Create `test/integration/all-exceptions-filter.test.ts`:

```typescript
import { Controller, Get } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AllExceptionsFilter } from '../../src/http/filters/all-exceptions.filter';

@Controller('__test__')
class ThrowingController {
  @Get('raw-error')
  throwRaw(): never {
    throw new Error('unexpected crash');
  }
}

describe('AllExceptionsFilter (integration)', () => {
  it('returns 500 without stack trace when a raw Error is thrown from a route', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ThrowingController],
    }).compile();

    const app = moduleRef.createNestApplication();
    const httpAdapterHost = app.get(HttpAdapterHost);
    app.useGlobalFilters(new AllExceptionsFilter(httpAdapterHost));
    await app.init();

    const response = await request(app.getHttpServer())
      .get('/__test__/raw-error')
      .expect(500);

    expect(response.body).toEqual({ statusCode: 500, message: 'Internal server error' });
    expect(response.body).not.toHaveProperty('stack');
    expect(response.body).not.toHaveProperty('trace');

    await app.close();
  });
});
```

- [ ] **Step 3.2 — Run the integration test and confirm it passes**

```bash
npm run test:integration -- --testPathPattern="all-exceptions-filter" 2>&1 | tail -10
```

Expected: `Tests: 1 passed, 1 total`

- [ ] **Step 3.3 — Commit**

```bash
git add test/integration/all-exceptions-filter.test.ts
git commit -m "test(f11): add integration test for AllExceptionsFilter

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 4 — Full test suite + coverage

- [ ] **Step 4.1 — Run the full unit test suite**

```bash
npm run test:cov 2>&1 | tail -20
```

Expected: All tests pass, coverage 100% statements/branches/functions/lines.

- [ ] **Step 4.2 — Run the full integration suite**

```bash
npm run test:integration 2>&1 | tail -20
```

Expected: All integration tests pass.

---

## Task 5 — Feature & agent plan docs, TDR link

**Files:**
- Create: `docs/tdr/feature-plans/f11-error-handling-plan.md` (brief pointer to this agent plan)
- Create: `docs/tdr/agent-plans/2026-04-10-f11-error-handling-agent-plan.md` (copy of this plan)
- Modify: `docs/tdr/master.md` (add links)

- [ ] **Step 5.1 — Create feature plan doc**

Create `docs/tdr/feature-plans/f11-error-handling-plan.md`:

```markdown
# F11 · Error Handling & Defensive Validation Hardening — Feature Plan

See the full agent plan: [2026-04-10-f11-error-handling-agent-plan.md](../agent-plans/2026-04-10-f11-error-handling-agent-plan.md)

## Summary

- **Scope check:** HCM timeout (R2) and input validation already complete from prior features.
- **Code change:** Add `AllExceptionsFilter` (`src/http/filters/`) registered globally in `bootstrap()`.
- **Tests:** Unit tests for both paths (non-HTTP → 500, HTTP → pass-through) + one integration test.
```

- [ ] **Step 5.2 — Create agent plan doc**

```bash
cp /path-to-this-file docs/tdr/agent-plans/2026-04-10-f11-error-handling-agent-plan.md
```

*(The agent should save the full content of this plan to that path.)*

- [ ] **Step 5.3 — Update master.md**

Add after the existing F11 spec line:

```markdown
- F11 error handling plan: [f11-error-handling-plan.md](./feature-plans/f11-error-handling-plan.md)
- F11 error handling agent plan: [2026-04-10-f11-error-handling-agent-plan.md](./agent-plans/2026-04-10-f11-error-handling-agent-plan.md)
```

Also add F11 Design Decisions section to `docs/tdr/master.md`:

```markdown
## F11 Design Decisions

Resolved during F11 planning.

| Decision | Choice | Rationale |
|---|---|---|
| Error response format | NestJS default `{ statusCode, message, error }` | Consistent with all prior features; no custom shape needed |
| HCM timeout | Already implemented (R2 complete from earlier work) | `HCM_TIMEOUT_MS` env var, default 3000 ms |
| HCM retry | None | Out of scope; clean 503 is sufficient for this exercise |
| Race condition handling | SQLite serialization + in-transaction re-checks | SQLite single-writer model serializes writes; re-check inside every `$transaction` prevents double-spend |
| Global filter registration | `app.useGlobalFilters` in `bootstrap()` | Not `APP_FILTER`, so integration tests can configure independently |
```

- [ ] **Step 5.4 — Commit**

```bash
git add docs/tdr/feature-plans/f11-error-handling-plan.md \
        docs/tdr/agent-plans/2026-04-10-f11-error-handling-agent-plan.md \
        docs/tdr/master.md
git commit -m "docs(f11): add feature plan, agent plan, TDR design decisions

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 6 — Mutation testing

- [ ] **Step 6.1 — Run Stryker on changed files**

```bash
npm run stryker 2>&1 | tail -30
```

Expected: Mutation score 100% (or above configured threshold) for `src/http/filters/all-exceptions.filter.ts`.

If any mutants survive, add targeted tests to kill them before proceeding.

---

## Task 7 — Final validation (spec review + code review)

- [ ] **Step 7.1 — Run spec review agent**

Dispatch the `requesting-code-review` or `superpowers:code-reviewer` agent pointing at the branch diff against `origin/main`, spec `docs/tdr/specs/f11-error-handling-spec.md`, and the five changed/created source files.

- [ ] **Step 7.2 — Address any findings**

Fix any issues flagged before proceeding to Task 7.3.

- [ ] **Step 7.3 — Push branch and open PR**

```bash
git push -u origin f11-error-handling
gh pr create --title "feat: F11 — Error Handling & Defensive Validation Hardening" \
  --body "Implements AllExceptionsFilter (R1). R2 (HCM timeout) and R3 (race condition docs) confirmed already complete." \
  --base main
```
