import type { BalanceAuditEntry } from '@prisma/client';

import type { PrismaService } from '@app-prisma/prisma.service';

import { BalanceAuditService, AUDIT_REASONS } from '@core/services/balance-audit.service';

describe('BalanceAuditService', () => {
  const mockAuditEntry: BalanceAuditEntry = {
    id: 'audit-1',
    balanceId: 'balance-1',
    requestId: 'request-1',
    delta: -3,
    reason: 'RESERVATION',
    reference: null,
    actorId: 'actor-1',
    createdAt: new Date('2026-05-01T10:00:00Z'),
  };

  const createService = () => {
    const prismaService = {
      balance: {
        findUnique: jest.fn(),
      },
      balanceAuditEntry: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
    } as unknown as PrismaService;

    const service = new BalanceAuditService(prismaService);

    return { service, prismaService };
  };

  describe('recordEntry', () => {
    it('creates an audit entry via prisma', async () => {
      const { service, prismaService } = createService();
      const createMock = prismaService.balanceAuditEntry.create as jest.Mock;
      createMock.mockResolvedValue(mockAuditEntry);

      const result = await service.recordEntry({
        balanceId: 'balance-1',
        delta: -3,
        reason: 'RESERVATION',
        requestId: 'request-1',
        reference: 'ref-1',
        actorId: 'actor-1',
      });

      expect(result).toEqual(mockAuditEntry);
      expect(createMock).toHaveBeenCalledWith({
        data: {
          balanceId: 'balance-1',
          delta: -3,
          reason: 'RESERVATION',
          requestId: 'request-1',
          reference: 'ref-1',
          actorId: 'actor-1',
        },
      });
    });

    it('creates an audit entry with optional fields omitted', async () => {
      const { service, prismaService } = createService();
      const entryWithoutOptionals = {
        ...mockAuditEntry,
        requestId: null,
        actorId: null,
      };
      const createMock = prismaService.balanceAuditEntry.create as jest.Mock;
      createMock.mockResolvedValue(entryWithoutOptionals);

      const result = await service.recordEntry({
        balanceId: 'balance-1',
        delta: 5,
        reason: 'BATCH_SYNC',
      });

      expect(result).toEqual(entryWithoutOptionals);
      const callData = createMock.mock.calls[0][0].data;
      expect(callData).toEqual({
        balanceId: 'balance-1',
        delta: 5,
        reason: 'BATCH_SYNC',
      });
      expect(callData).not.toHaveProperty('requestId');
      expect(callData).not.toHaveProperty('reference');
      expect(callData).not.toHaveProperty('actorId');
    });

    it('rejects an invalid reason value', async () => {
      const { service } = createService();

      await expect(
        service.recordEntry({
          balanceId: 'balance-1',
          delta: -1,
          reason: 'INVALID_REASON' as any,
        }),
      ).rejects.toThrow('Invalid audit reason: INVALID_REASON');
    });

    it('accepts HCM_SYNC as a valid audit reason', async () => {
      const { service, prismaService } = createService();
      const syncEntry = {
        ...mockAuditEntry,
        id: 'audit-sync-1',
        delta: 0,
        reason: 'HCM_SYNC',
        reference: 'operation=approve outcome=success hcmRequestId=hcm-req-1',
      };
      const createMock = prismaService.balanceAuditEntry.create as jest.Mock;
      createMock.mockResolvedValue(syncEntry);

      const result = await service.recordEntry({
        balanceId: 'balance-1',
        delta: 0,
        reason: 'HCM_SYNC' as any,
        requestId: 'request-1',
        reference: 'operation=approve outcome=success hcmRequestId=hcm-req-1',
      });

      expect(result).toEqual(syncEntry);
      expect(createMock).toHaveBeenCalledWith({
        data: {
          balanceId: 'balance-1',
          delta: 0,
          reason: 'HCM_SYNC',
          requestId: 'request-1',
          reference: 'operation=approve outcome=success hcmRequestId=hcm-req-1',
        },
      });
    });
  });

  describe('recordEntryInTx', () => {
    it('creates an audit entry via the provided tx client', async () => {
      const { service } = createService();
      const mockTx = {
        balanceAuditEntry: { create: jest.fn().mockResolvedValue(mockAuditEntry) },
      } as any;

      const result = await service.recordEntryInTx(mockTx, {
        balanceId: 'balance-1',
        delta: -3,
        reason: 'RESERVATION',
        requestId: 'request-1',
        reference: 'ref-1',
        actorId: 'actor-1',
      });

      expect(result).toEqual(mockAuditEntry);
      expect(mockTx.balanceAuditEntry.create).toHaveBeenCalledWith({
        data: {
          balanceId: 'balance-1',
          delta: -3,
          reason: 'RESERVATION',
          requestId: 'request-1',
          reference: 'ref-1',
          actorId: 'actor-1',
        },
      });
    });

    it('creates an audit entry with optional fields omitted via tx', async () => {
      const { service } = createService();
      const entryWithoutOptionals = { ...mockAuditEntry, requestId: null, actorId: null };
      const mockTx = {
        balanceAuditEntry: { create: jest.fn().mockResolvedValue(entryWithoutOptionals) },
      } as any;

      const result = await service.recordEntryInTx(mockTx, {
        balanceId: 'balance-1',
        delta: 5,
        reason: 'BATCH_SYNC',
      });

      expect(result).toEqual(entryWithoutOptionals);
      const callData = (mockTx.balanceAuditEntry.create as jest.Mock).mock.calls[0][0].data;
      expect(callData).toEqual({ balanceId: 'balance-1', delta: 5, reason: 'BATCH_SYNC' });
      expect(callData).not.toHaveProperty('requestId');
      expect(callData).not.toHaveProperty('reference');
      expect(callData).not.toHaveProperty('actorId');
    });

    it('rejects an invalid reason value via tx', async () => {
      const { service } = createService();
      const mockTx = { balanceAuditEntry: { create: jest.fn() } } as any;

      await expect(
        service.recordEntryInTx(mockTx, {
          balanceId: 'balance-1',
          delta: -1,
          reason: 'INVALID_REASON' as any,
        }),
      ).rejects.toThrow('Invalid audit reason: INVALID_REASON');
    });
  });

  describe('getHistory', () => {
    it('throws NotFoundException when balance not found', async () => {
      const { service, prismaService } = createService();
      const findUniqueMock = prismaService.balance.findUnique as jest.Mock;
      findUniqueMock.mockResolvedValue(null);

      await expect(service.getHistory('emp-1', 'loc-1')).rejects.toThrow(
        'Balance not found for employee emp-1 at location loc-1',
      );

      expect(findUniqueMock).toHaveBeenCalledWith({
        where: { employeeId_locationId: { employeeId: 'emp-1', locationId: 'loc-1' } },
      });
    });

    it('returns paginated entries sorted descending by createdAt', async () => {
      const { service, prismaService } = createService();
      const findUniqueMock = prismaService.balance.findUnique as jest.Mock;
      findUniqueMock.mockResolvedValue({ id: 'balance-1' });

      const entries = [
        { ...mockAuditEntry, id: 'audit-2', createdAt: new Date('2026-05-02T10:00:00Z') },
        { ...mockAuditEntry, id: 'audit-1', createdAt: new Date('2026-05-01T10:00:00Z') },
      ];

      const findManyMock = prismaService.balanceAuditEntry.findMany as jest.Mock;
      findManyMock.mockResolvedValue(entries);

      const countMock = prismaService.balanceAuditEntry.count as jest.Mock;
      countMock.mockResolvedValue(2);

      const result = await service.getHistory('emp-1', 'loc-1');

      expect(result).toEqual({
        data: entries,
        pagination: { page: 1, limit: 20, total: 2, totalPages: 1 },
      });

      expect(findManyMock).toHaveBeenCalledWith({
        where: { balanceId: 'balance-1' },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      });

      expect(countMock).toHaveBeenCalledWith({ where: { balanceId: 'balance-1' } });
    });

    it('uses defaults page=1, limit=20 when not specified', async () => {
      const { service, prismaService } = createService();
      const findUniqueMock = prismaService.balance.findUnique as jest.Mock;
      findUniqueMock.mockResolvedValue({ id: 'balance-1' });

      const findManyMock = prismaService.balanceAuditEntry.findMany as jest.Mock;
      findManyMock.mockResolvedValue([]);

      const countMock = prismaService.balanceAuditEntry.count as jest.Mock;
      countMock.mockResolvedValue(0);

      await service.getHistory('emp-1', 'loc-1');

      expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 20 }));
    });

    it('applies reason filter when provided', async () => {
      const { service, prismaService } = createService();
      const findUniqueMock = prismaService.balance.findUnique as jest.Mock;
      findUniqueMock.mockResolvedValue({ id: 'balance-1' });

      const findManyMock = prismaService.balanceAuditEntry.findMany as jest.Mock;
      findManyMock.mockResolvedValue([mockAuditEntry]);

      const countMock = prismaService.balanceAuditEntry.count as jest.Mock;
      countMock.mockResolvedValue(1);

      await service.getHistory('emp-1', 'loc-1', { reason: 'RESERVATION' });

      const expectedWhere = { balanceId: 'balance-1', reason: 'RESERVATION' };

      expect(findManyMock).toHaveBeenCalledWith({
        where: expectedWhere,
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      });

      expect(countMock).toHaveBeenCalledWith({ where: expectedWhere });
    });

    it('paginates with custom page and limit', async () => {
      const { service, prismaService } = createService();
      const findUniqueMock = prismaService.balance.findUnique as jest.Mock;
      findUniqueMock.mockResolvedValue({ id: 'balance-1' });

      const findManyMock = prismaService.balanceAuditEntry.findMany as jest.Mock;
      findManyMock.mockResolvedValue([]);

      const countMock = prismaService.balanceAuditEntry.count as jest.Mock;
      countMock.mockResolvedValue(50);

      const result = await service.getHistory('emp-1', 'loc-1', { page: 3, limit: 10 });

      expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 10 }));
      expect(result.pagination).toEqual({ page: 3, limit: 10, total: 50, totalPages: 5 });
    });

    it('clamps page to minimum 1 when page is 0', async () => {
      const { service, prismaService } = createService();
      const findUniqueMock = prismaService.balance.findUnique as jest.Mock;
      findUniqueMock.mockResolvedValue({ id: 'balance-1' });

      const findManyMock = prismaService.balanceAuditEntry.findMany as jest.Mock;
      findManyMock.mockResolvedValue([]);

      const countMock = prismaService.balanceAuditEntry.count as jest.Mock;
      countMock.mockResolvedValue(0);

      const result = await service.getHistory('emp-1', 'loc-1', { page: 0 });

      expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({ skip: 0 }));
      expect(result.pagination.page).toBe(1);
    });

    it('clamps page to minimum 1 when page is negative', async () => {
      const { service, prismaService } = createService();
      const findUniqueMock = prismaService.balance.findUnique as jest.Mock;
      findUniqueMock.mockResolvedValue({ id: 'balance-1' });

      const findManyMock = prismaService.balanceAuditEntry.findMany as jest.Mock;
      findManyMock.mockResolvedValue([]);

      const countMock = prismaService.balanceAuditEntry.count as jest.Mock;
      countMock.mockResolvedValue(0);

      const result = await service.getHistory('emp-1', 'loc-1', { page: -5 });

      expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({ skip: 0 }));
      expect(result.pagination.page).toBe(1);
    });

    it('clamps limit to minimum 1 when limit is 0', async () => {
      const { service, prismaService } = createService();
      const findUniqueMock = prismaService.balance.findUnique as jest.Mock;
      findUniqueMock.mockResolvedValue({ id: 'balance-1' });

      const findManyMock = prismaService.balanceAuditEntry.findMany as jest.Mock;
      findManyMock.mockResolvedValue([]);

      const countMock = prismaService.balanceAuditEntry.count as jest.Mock;
      countMock.mockResolvedValue(0);

      const result = await service.getHistory('emp-1', 'loc-1', { limit: 0 });

      expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({ take: 1 }));
      expect(result.pagination.limit).toBe(1);
    });

    it('clamps limit to minimum 1 when limit is negative', async () => {
      const { service, prismaService } = createService();
      const findUniqueMock = prismaService.balance.findUnique as jest.Mock;
      findUniqueMock.mockResolvedValue({ id: 'balance-1' });

      const findManyMock = prismaService.balanceAuditEntry.findMany as jest.Mock;
      findManyMock.mockResolvedValue([]);

      const countMock = prismaService.balanceAuditEntry.count as jest.Mock;
      countMock.mockResolvedValue(0);

      const result = await service.getHistory('emp-1', 'loc-1', { limit: -10 });

      expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({ take: 1 }));
      expect(result.pagination.limit).toBe(1);
    });

    it('caps limit at 100', async () => {
      const { service, prismaService } = createService();
      const findUniqueMock = prismaService.balance.findUnique as jest.Mock;
      findUniqueMock.mockResolvedValue({ id: 'balance-1' });

      const findManyMock = prismaService.balanceAuditEntry.findMany as jest.Mock;
      findManyMock.mockResolvedValue([]);

      const countMock = prismaService.balanceAuditEntry.count as jest.Mock;
      countMock.mockResolvedValue(0);

      await service.getHistory('emp-1', 'loc-1', { limit: 500 });

      expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({ take: 100 }));
    });
  });

  it('exports AUDIT_REASONS constant with all valid values', () => {
    expect(AUDIT_REASONS).toEqual([
      'RESERVATION',
      'RESERVATION_RELEASE',
      'APPROVAL_DEDUCTION',
      'CANCELLATION_RESTORE',
      'BATCH_SYNC',
      'HCM_SYNC',
      'MANUAL_ADJUSTMENT',
    ]);
  });
});
