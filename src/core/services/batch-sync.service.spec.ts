import type { PrismaService } from '@app-prisma/prisma.service';

import { BalanceAuditService } from '@core/services/balance-audit.service';
import { BalanceService } from '@core/services/balance.service';
import { BatchSyncService } from '@core/services/batch-sync.service';

describe('BatchSyncService', () => {
  const mockBalance = {
    id: 'balance-1',
    employeeId: 'emp-1',
    locationId: 'loc-1',
    availableDays: 10,
    reservedDays: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const createService = () => {
    const balanceService = {
      upsertBalance: jest.fn(),
    } as unknown as BalanceService;

    const auditService = {
      recordEntry: jest.fn(),
    } as unknown as BalanceAuditService;

    const prismaService = {
      timeOffRequest: {
        findMany: jest.fn(),
      },
    } as unknown as PrismaService;

    const service = new BatchSyncService(balanceService, auditService, prismaService);

    return { service, balanceService, auditService, prismaService };
  };

  describe('syncBatch', () => {
    it('creates a new balance, records a BATCH_SYNC audit entry, and returns created:1', async () => {
      const { service, balanceService, auditService, prismaService } = createService();
      (balanceService.upsertBalance as jest.Mock).mockResolvedValue({
        balance: { ...mockBalance, id: 'balance-new' },
        previousAvailableDays: 0,
        wasCreated: true,
      });
      (auditService.recordEntry as jest.Mock).mockResolvedValue({});
      (prismaService.timeOffRequest.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.syncBatch([{ employeeId: 'emp-1', locationId: 'loc-1', availableDays: 10 }]);

      expect(result.summary).toEqual({ created: 1, updated: 0, unchanged: 0, conflicted: 0, failed: 0 });
      expect(result.conflicts).toEqual([]);
      expect(result.errors).toEqual([]);
      expect(auditService.recordEntry).toHaveBeenCalledWith({
        balanceId: 'balance-new',
        delta: 10,
        reason: 'BATCH_SYNC',
        reference: 'HCM batch sync',
      });
    });

    it('skips an unchanged balance without recording an audit entry and returns unchanged:1', async () => {
      const { service, balanceService, auditService, prismaService } = createService();
      (balanceService.upsertBalance as jest.Mock).mockResolvedValue({
        balance: mockBalance,
        previousAvailableDays: 10,
        wasCreated: false,
      });

      const result = await service.syncBatch([{ employeeId: 'emp-1', locationId: 'loc-1', availableDays: 10 }]);

      expect(result.summary).toEqual({ created: 0, updated: 0, unchanged: 1, conflicted: 0, failed: 0 });
      expect(auditService.recordEntry).not.toHaveBeenCalled();
      expect(prismaService.timeOffRequest.findMany).not.toHaveBeenCalled();
    });

    it('updates a changed balance, records a BATCH_SYNC audit entry with correct delta, and returns updated:1', async () => {
      const { service, balanceService, auditService, prismaService } = createService();
      (balanceService.upsertBalance as jest.Mock).mockResolvedValue({
        balance: { ...mockBalance, availableDays: 25 },
        previousAvailableDays: 10,
        wasCreated: false,
      });
      (auditService.recordEntry as jest.Mock).mockResolvedValue({});
      (prismaService.timeOffRequest.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.syncBatch([{ employeeId: 'emp-1', locationId: 'loc-1', availableDays: 25 }]);

      expect(result.summary).toEqual({ created: 0, updated: 1, unchanged: 0, conflicted: 0, failed: 0 });
      expect(auditService.recordEntry).toHaveBeenCalledWith({
        balanceId: 'balance-1',
        delta: 15,
        reason: 'BATCH_SYNC',
        reference: 'HCM batch sync',
      });
    });

    it('flags a conflict when a PENDING request exists for the updated balance and returns conflicted:1', async () => {
      const { service, balanceService, auditService, prismaService } = createService();
      (balanceService.upsertBalance as jest.Mock).mockResolvedValue({
        balance: { ...mockBalance, availableDays: 5 },
        previousAvailableDays: 10,
        wasCreated: false,
      });
      (auditService.recordEntry as jest.Mock).mockResolvedValue({});
      (prismaService.timeOffRequest.findMany as jest.Mock).mockResolvedValue([{ id: 'req-1' }, { id: 'req-2' }]);

      const result = await service.syncBatch([{ employeeId: 'emp-1', locationId: 'loc-1', availableDays: 5 }]);

      expect(result.summary).toEqual({ created: 0, updated: 1, unchanged: 0, conflicted: 1, failed: 0 });
      expect(result.conflicts).toEqual([
        { employeeId: 'emp-1', locationId: 'loc-1', pendingRequestIds: ['req-1', 'req-2'] },
      ]);
      expect(prismaService.timeOffRequest.findMany).toHaveBeenCalledWith({
        where: { employeeId: 'emp-1', locationId: 'loc-1', status: 'PENDING' },
        select: { id: true },
      });
    });

    it('catches a processing error, adds it to errors, increments failed, and continues processing remaining entries', async () => {
      const { service, balanceService, auditService, prismaService } = createService();
      (balanceService.upsertBalance as jest.Mock).mockRejectedValueOnce(new Error('DB error')).mockResolvedValueOnce({
        balance: { ...mockBalance, id: 'balance-2', employeeId: 'emp-2', locationId: 'loc-2' },
        previousAvailableDays: 0,
        wasCreated: true,
      });
      (auditService.recordEntry as jest.Mock).mockResolvedValue({});
      (prismaService.timeOffRequest.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.syncBatch([
        { employeeId: 'emp-1', locationId: 'loc-1', availableDays: 10 },
        { employeeId: 'emp-2', locationId: 'loc-2', availableDays: 5 },
      ]);

      expect(result.summary).toEqual({ created: 1, updated: 0, unchanged: 0, conflicted: 0, failed: 1 });
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({ employeeId: 'emp-1', locationId: 'loc-1', message: 'DB error' });
    });

    it('handles a non-Error thrown value and uses String() for the message', async () => {
      const { service, balanceService } = createService();
      (balanceService.upsertBalance as jest.Mock).mockRejectedValueOnce('string error');

      const result = await service.syncBatch([{ employeeId: 'emp-1', locationId: 'loc-1', availableDays: 10 }]);

      expect(result.summary).toEqual({ created: 0, updated: 0, unchanged: 0, conflicted: 0, failed: 1 });
      expect(result.errors[0]).toEqual({ employeeId: 'emp-1', locationId: 'loc-1', message: 'string error' });
    });

    it('accumulates results across multiple entries correctly', async () => {
      const { service, balanceService, auditService, prismaService } = createService();
      (balanceService.upsertBalance as jest.Mock)
        .mockResolvedValueOnce({ balance: { ...mockBalance, id: 'b1' }, previousAvailableDays: 0, wasCreated: true })
        .mockResolvedValueOnce({
          balance: { ...mockBalance, id: 'b2', availableDays: 5 },
          previousAvailableDays: 5,
          wasCreated: false,
        })
        .mockResolvedValueOnce({
          balance: { ...mockBalance, id: 'b3', availableDays: 20 },
          previousAvailableDays: 10,
          wasCreated: false,
        });
      (auditService.recordEntry as jest.Mock).mockResolvedValue({});
      (prismaService.timeOffRequest.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.syncBatch([
        { employeeId: 'emp-1', locationId: 'loc-1', availableDays: 10 }, // new
        { employeeId: 'emp-2', locationId: 'loc-2', availableDays: 5 }, // unchanged
        { employeeId: 'emp-3', locationId: 'loc-3', availableDays: 20 }, // updated
      ]);

      expect(result.summary).toEqual({ created: 1, updated: 1, unchanged: 1, conflicted: 0, failed: 0 });
    });

    it('does not skip a newly created balance with zero availableDays — records audit and counts as created:1', async () => {
      const { service, balanceService, auditService, prismaService } = createService();
      (balanceService.upsertBalance as jest.Mock).mockResolvedValue({
        balance: { ...mockBalance, id: 'balance-zero', availableDays: 0 },
        previousAvailableDays: 0,
        wasCreated: true,
      });
      (auditService.recordEntry as jest.Mock).mockResolvedValue({});
      (prismaService.timeOffRequest.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.syncBatch([{ employeeId: 'emp-1', locationId: 'loc-1', availableDays: 0 }]);

      expect(result.summary).toEqual({ created: 1, updated: 0, unchanged: 0, conflicted: 0, failed: 0 });
      expect(auditService.recordEntry).toHaveBeenCalledWith({
        balanceId: 'balance-zero',
        delta: 0,
        reason: 'BATCH_SYNC',
        reference: 'HCM batch sync',
      });
    });
  });
});
