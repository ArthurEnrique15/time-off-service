# Time-Off Service

A NestJS microservice that manages employee time-off balances, requests, and audit history. It maintains a local SQLite cache and integrates with an external HCM (Human Capital Management) system as the source of truth.

Github link: https://github.com/ArthurEnrique15/time-off-service

## Prerequisites

- **Node.js** 20 LTS
- **npm** 10+
- **Docker** and **Docker Compose** (for containerized setup)

## Quick Start with Docker

The fastest way to get the service running with the HCM mock:

```bash
docker compose up --build
```

This starts two containers:

| Service | URL | Description |
|---|---|---|
| `time-off-service` | http://localhost:3000 | Main API |
| `hcm-mock` | http://localhost:4010 | Mock HCM server with seed data |

Verify everything is running:

```bash
curl http://localhost:3000/health
curl http://localhost:4010/health
```

To stop the services:

```bash
docker compose down
```

SQLite data is persisted in the `data/` directory via a Docker volume.

## Local Development

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy the example environment file and adjust as needed:

```bash
cp .env.example .env
```

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `local` | Environment (`local`, `test`, `dev`, `prod`) |
| `PORT` | `3000` | HTTP server port |
| `DATABASE_URL` | `file:./dev.db` | SQLite database file path |
| `HCM_API_BASE_URL` | `http://127.0.0.1:4010` | HCM API base URL |
| `HCM_TIMEOUT_MS` | `3000` | HCM request timeout in milliseconds |

### 3. Run database migrations

```bash
npx prisma migrate deploy
```

### 4. Start the service

```bash
# Development (watch mode)
npm run start:dev

# Production
npm run build
npm run start:prod
```

## API Endpoints

### Health

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Service health check |

### Balances

| Method | Path | Description |
|---|---|---|
| `GET` | `/balances?employeeId=<id>` | List balances for an employee |
| `GET` | `/balances/:employeeId/:locationId` | Get balance for employee at location |

### Balance Audit History

| Method | Path | Description |
|---|---|---|
| `GET` | `/balances/:employeeId/:locationId/history` | Get audit history (supports `?page`, `?limit`, `?reason`) |

### Time-Off Requests

| Method | Path | Description |
|---|---|---|
| `POST` | `/time-off-requests` | Create a time-off request |
| `GET` | `/time-off-requests?employeeId=<id>` | List requests (supports `?status`, `?page`, `?limit`) |
| `GET` | `/time-off-requests/:id` | Get a specific request |
| `PATCH` | `/time-off-requests/:id/approve` | Approve a request |
| `PATCH` | `/time-off-requests/:id/reject` | Reject a request |
| `PATCH` | `/time-off-requests/:id/cancel` | Cancel a request |

### Batch Sync

| Method | Path | Description |
|---|---|---|
| `POST` | `/sync/batch` | Sync balances from HCM |

## Testing

```bash
# Unit tests (100% coverage enforced)
npm run test:cov

# Integration tests
npm run test:integration

# Mutation testing (files changed vs main)
npm run stryker
```

## Project Structure

```
├── src/
│   ├── core/              # Business logic (services)
│   ├── http/              # HTTP layer (controllers, DTOs, filters)
│   ├── module/            # NestJS module wiring
│   ├── prisma/            # Prisma service and module
│   └── shared/            # Shared infrastructure
│       ├── config/        # Environment configuration
│       ├── core/          # Either pattern, custom HTTP client
│       ├── errors/        # Domain error types
│       └── providers/     # External provider clients (HCM)
├── prisma/
│   ├── schema.prisma      # Database schema
│   └── migrations/        # Migration history
├── mock/                  # Standalone HCM mock server
├── test/
│   ├── integration/       # Integration tests
│   └── support/           # Test helpers (mock server, env setup)
├── docs/tdr/              # Technical decision records and specs
├── Dockerfile             # Multi-stage production build
├── docker-compose.yml     # Service + HCM mock orchestration
└── package.json
```

## HCM Mock Server

The `mock/` directory contains a standalone mock of the HCM API, pre-seeded with sample data:

| Employee | Location | Available Days |
|---|---|---|
| `emp-001` | `loc-us` | 20 |
| `emp-001` | `loc-eu` | 25 |
| `emp-002` | `loc-us` | 15 |
| `emp-003` | `loc-us` | 10 |
| `emp-003` | `loc-eu` | 30 |
| `emp-004` | `loc-apac` | 18 |

The mock runs on port 4010 and supports the same endpoints as the real HCM API: balance lookups, time-off request submission, and cancellation.
