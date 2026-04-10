# F11 · Error Handling & Defensive Validation Hardening — Feature Plan

See the full agent plan: [2026-04-10-f11-error-handling-agent-plan.md](../agent-plans/2026-04-10-f11-error-handling-agent-plan.md)

## Summary

- **Scope check:** HCM timeout (R2) and input validation are already complete from prior features.
- **Code change:** Add `AllExceptionsFilter` (`src/http/filters/`) registered globally in `bootstrap()`.
- **Tests:** Unit tests for both paths (non-HTTP → 500, HTTP → pass-through) + one integration test.
