# Base Foundation Specification

## Context
- This specification defines the non-business foundation of the time-off service.
- It exists to enable future feature work to start from an agreed architecture, documentation model, and testing baseline.

## EARS Requirements
- The system shall provide a runnable NestJS service skeleton with REST-only wiring.
- The system shall provide validated environment configuration before the application starts.
- When the application starts, the system shall expose a health endpoint for runtime verification.
- When the health endpoint is invoked, the system shall return the service status, the configured environment, and the current dependency reachability checks.
- The system shall provide Prisma + SQLite bootstrap infrastructure without introducing business tables.
- The system shall provide isolated unit and integration test harnesses.
- The system shall provide an integration-test HCM mock facility that can simulate external dependency availability.
- The repository shall provide a living TDR that links specifications, implementation plans, and agent work plans.
- The repository shall require feature specifications to use EARS notation.
- The repository shall require implementation to follow TDD and maintain 100% unit-test coverage.

## Out Of Scope
- Time-off request workflows
- Balance ingestion, synchronization, or approval logic
- Public business endpoints beyond operational health verification
