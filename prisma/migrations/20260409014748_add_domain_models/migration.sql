-- CreateTable
CREATE TABLE "Balance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "availableDays" INTEGER NOT NULL DEFAULT 0,
    "reservedDays" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TimeOffRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BalanceAuditEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "balanceId" TEXT NOT NULL,
    "requestId" TEXT,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "reference" TEXT,
    "actorId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BalanceAuditEntry_balanceId_fkey" FOREIGN KEY ("balanceId") REFERENCES "Balance" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BalanceAuditEntry_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "TimeOffRequest" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Balance_employeeId_idx" ON "Balance"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "Balance_employeeId_locationId_key" ON "Balance"("employeeId", "locationId");

-- CreateIndex
CREATE INDEX "TimeOffRequest_employeeId_status_idx" ON "TimeOffRequest"("employeeId", "status");

-- CreateIndex
CREATE INDEX "BalanceAuditEntry_balanceId_createdAt_idx" ON "BalanceAuditEntry"("balanceId", "createdAt");
