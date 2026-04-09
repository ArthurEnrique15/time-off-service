import type { BalanceAuditService, PaginatedAuditHistory } from '@core/services/balance-audit.service';

import { BalanceAuditController } from '@http/controllers/balance-audit.controller';

describe('BalanceAuditController', () => {
  const mockPaginatedResponse: PaginatedAuditHistory = {
    data: [
      {
        id: 'audit-1',
        balanceId: 'balance-1',
        requestId: null,
        delta: -3,
        reason: 'RESERVATION',
        reference: null,
        actorId: 'actor-1',
        createdAt: new Date('2026-05-01T10:00:00Z'),
      },
    ],
    pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
  };

  const createController = () => {
    const balanceAuditService = {
      getHistory: jest.fn().mockResolvedValue(mockPaginatedResponse),
    } as unknown as BalanceAuditService;

    const controller = new BalanceAuditController(balanceAuditService);

    return { controller, balanceAuditService };
  };

  it('delegates to balanceAuditService.getHistory with parsed params', async () => {
    const { controller, balanceAuditService } = createController();

    const result = await controller.getHistory('emp-1', 'loc-1', '2', '10', 'RESERVATION');

    expect(result).toEqual(mockPaginatedResponse);
    expect(balanceAuditService.getHistory).toHaveBeenCalledWith('emp-1', 'loc-1', {
      page: 2,
      limit: 10,
      reason: 'RESERVATION',
    });
  });

  it('uses default page=1 and limit=20 when not provided', async () => {
    const { controller, balanceAuditService } = createController();

    await controller.getHistory('emp-1', 'loc-1', undefined, undefined, undefined);

    expect(balanceAuditService.getHistory).toHaveBeenCalledWith('emp-1', 'loc-1', {
      page: 1,
      limit: 20,
      reason: undefined,
    });
  });

  it('passes reason filter through when provided', async () => {
    const { controller, balanceAuditService } = createController();

    await controller.getHistory('emp-1', 'loc-1', undefined, undefined, 'BATCH_SYNC');

    expect(balanceAuditService.getHistory).toHaveBeenCalledWith('emp-1', 'loc-1', {
      page: 1,
      limit: 20,
      reason: 'BATCH_SYNC',
    });
  });

  it('throws BadRequestException for invalid reason query param', async () => {
    const { controller } = createController();

    await expect(controller.getHistory('emp-1', 'loc-1', undefined, undefined, 'INVALID')).rejects.toThrow(
      'Invalid audit reason: INVALID',
    );
  });

  it('returns the service response directly', async () => {
    const { controller } = createController();

    const result = await controller.getHistory('emp-1', 'loc-1', undefined, undefined, undefined);

    expect(result).toEqual(mockPaginatedResponse);
  });
});
