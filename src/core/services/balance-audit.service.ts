import { Injectable, NotFoundException } from '@nestjs/common';
import type { BalanceAuditEntry } from '@prisma/client';

import { PrismaService } from '@app-prisma/prisma.service';

type TxClient = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

export const AUDIT_REASONS = [
  'RESERVATION',
  'RESERVATION_RELEASE',
  'APPROVAL_DEDUCTION',
  'CANCELLATION_RESTORE',
  'BATCH_SYNC',
  'HCM_SYNC',
  'MANUAL_ADJUSTMENT',
] as const;

export type AuditReason = (typeof AUDIT_REASONS)[number];

export type CreateAuditEntryInput = {
  balanceId: string;
  delta: number;
  reason: AuditReason;
  requestId?: string;
  reference?: string;
  actorId?: string;
};

export type PaginatedAuditHistory = {
  data: BalanceAuditEntry[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

const MAX_LIMIT = 100;
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

@Injectable()
export class BalanceAuditService {
  constructor(private readonly prismaService: PrismaService) {}

  async recordEntry(input: CreateAuditEntryInput): Promise<BalanceAuditEntry> {
    if (!AUDIT_REASONS.includes(input.reason)) {
      throw new Error(`Invalid audit reason: ${input.reason}`);
    }

    return this.prismaService.balanceAuditEntry.create({
      data: {
        balanceId: input.balanceId,
        delta: input.delta,
        reason: input.reason,
        ...(input.requestId !== undefined && { requestId: input.requestId }),
        ...(input.reference !== undefined && { reference: input.reference }),
        ...(input.actorId !== undefined && { actorId: input.actorId }),
      },
    });
  }

  async recordEntryInTx(tx: TxClient, input: CreateAuditEntryInput): Promise<BalanceAuditEntry> {
    if (!AUDIT_REASONS.includes(input.reason)) {
      throw new Error(`Invalid audit reason: ${input.reason}`);
    }

    return tx.balanceAuditEntry.create({
      data: {
        balanceId: input.balanceId,
        delta: input.delta,
        reason: input.reason,
        ...(input.requestId !== undefined && { requestId: input.requestId }),
        ...(input.reference !== undefined && { reference: input.reference }),
        ...(input.actorId !== undefined && { actorId: input.actorId }),
      },
    });
  }

  async getHistory(
    employeeId: string,
    locationId: string,
    options?: { page?: number; limit?: number; reason?: AuditReason },
  ): Promise<PaginatedAuditHistory> {
    const balance = await this.prismaService.balance.findUnique({
      where: { employeeId_locationId: { employeeId, locationId } },
    });

    if (!balance) {
      throw new NotFoundException(`Balance not found for employee ${employeeId} at location ${locationId}`);
    }

    const page = Math.max(options?.page ?? DEFAULT_PAGE, 1);
    const limit = Math.min(Math.max(options?.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const skip = (page - 1) * limit;

    const where: { balanceId: string; reason?: string } = { balanceId: balance.id };

    if (options?.reason) {
      where.reason = options.reason;
    }

    const [data, total] = await Promise.all([
      this.prismaService.balanceAuditEntry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prismaService.balanceAuditEntry.count({ where }),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  }
}
