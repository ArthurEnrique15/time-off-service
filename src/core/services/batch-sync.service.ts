import { Injectable } from '@nestjs/common';

import { PrismaService } from '@app-prisma/prisma.service';
import { BalanceAuditService } from '@core/services/balance-audit.service';
import { BalanceService } from '@core/services/balance.service';

export type BatchSyncEntry = {
  employeeId: string;
  locationId: string;
  availableDays: number;
};

export type BatchSyncConflict = {
  employeeId: string;
  locationId: string;
  pendingRequestIds: string[];
};

export type BatchSyncError = {
  employeeId: string;
  locationId: string;
  message: string;
};

export type BatchSyncSummary = {
  created: number;
  updated: number;
  unchanged: number;
  conflicted: number;
  failed: number;
};

export type BatchSyncResult = {
  summary: BatchSyncSummary;
  conflicts: BatchSyncConflict[];
  errors: BatchSyncError[];
};

@Injectable()
export class BatchSyncService {
  constructor(
    private readonly balanceService: BalanceService,
    private readonly balanceAuditService: BalanceAuditService,
    private readonly prismaService: PrismaService,
  ) {}

  async syncBatch(entries: BatchSyncEntry[]): Promise<BatchSyncResult> {
    const summary: BatchSyncSummary = { created: 0, updated: 0, unchanged: 0, conflicted: 0, failed: 0 };
    const conflicts: BatchSyncConflict[] = [];
    const errors: BatchSyncError[] = [];

    for (const { employeeId, locationId, availableDays } of entries) {
      try {
        const { balance, previousAvailableDays, wasCreated } = await this.balanceService.upsertBalance(
          employeeId,
          locationId,
          availableDays,
        );

        if (!wasCreated && previousAvailableDays === availableDays) {
          summary.unchanged++;
          continue;
        }

        const delta = availableDays - previousAvailableDays;

        await this.balanceAuditService.recordEntry({
          balanceId: balance.id,
          delta,
          reason: 'BATCH_SYNC',
          reference: 'HCM batch sync',
        });

        const pendingRequests = await this.prismaService.timeOffRequest.findMany({
          where: { employeeId, locationId, status: 'PENDING' },
          select: { id: true },
        });

        if (wasCreated) {
          summary.created++;
        } else {
          summary.updated++;
        }

        if (pendingRequests.length > 0) {
          summary.conflicted++;
          conflicts.push({ employeeId, locationId, pendingRequestIds: pendingRequests.map((r) => r.id) });
        }
      } catch (error) {
        summary.failed++;
        errors.push({
          employeeId,
          locationId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { summary, conflicts, errors };
  }
}
