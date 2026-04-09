import type { TimeOffRequest } from '@prisma/client';

import type { PrismaService } from '@app-prisma/prisma.service';

import { TimeOffRequestService } from '@core/services/time-off-request.service';

describe('TimeOffRequestService', () => {
  const mockRequest: TimeOffRequest = {
    id: 'req-1',
    employeeId: 'emp-1',
    locationId: 'loc-1',
    startDate: new Date('2026-06-01'),
    endDate: new Date('2026-06-05'),
    status: 'PENDING',
    createdAt: new Date('2026-05-01T10:00:00Z'),
    updatedAt: new Date('2026-05-01T10:00:00Z'),
  };

  const createService = () => {
    const prismaService = {
      timeOffRequest: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
    } as unknown as PrismaService;

    const service = new TimeOffRequestService(prismaService);

    return { service, prismaService };
  };

  describe('findById', () => {
    it('returns the request when found', async () => {
      const { service, prismaService } = createService();
      (prismaService.timeOffRequest.findUnique as jest.Mock).mockResolvedValue(mockRequest);

      const result = await service.findById('req-1');

      expect(result).toEqual(mockRequest);
      expect(prismaService.timeOffRequest.findUnique).toHaveBeenCalledWith({ where: { id: 'req-1' } });
    });

    it('returns null when not found', async () => {
      const { service, prismaService } = createService();
      (prismaService.timeOffRequest.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await service.findById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findAllByEmployee', () => {
    it('returns paginated results for an employee', async () => {
      const { service, prismaService } = createService();
      (prismaService.timeOffRequest.findMany as jest.Mock).mockResolvedValue([mockRequest]);
      (prismaService.timeOffRequest.count as jest.Mock).mockResolvedValue(1);

      const result = await service.findAllByEmployee('emp-1', { page: 1, limit: 20 });

      expect(result).toEqual({
        data: [mockRequest],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      });
      expect(prismaService.timeOffRequest.findMany).toHaveBeenCalledWith({
        where: { employeeId: 'emp-1' },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      });
      expect(prismaService.timeOffRequest.count).toHaveBeenCalledWith({ where: { employeeId: 'emp-1' } });
    });

    it('returns empty data when employee has no requests', async () => {
      const { service, prismaService } = createService();
      (prismaService.timeOffRequest.findMany as jest.Mock).mockResolvedValue([]);
      (prismaService.timeOffRequest.count as jest.Mock).mockResolvedValue(0);

      const result = await service.findAllByEmployee('emp-no-requests', { page: 1, limit: 20 });

      expect(result.data).toEqual([]);
      expect(result.pagination).toEqual({ page: 1, limit: 20, total: 0, totalPages: 0 });
    });

    it('filters by status when provided', async () => {
      const { service, prismaService } = createService();
      (prismaService.timeOffRequest.findMany as jest.Mock).mockResolvedValue([mockRequest]);
      (prismaService.timeOffRequest.count as jest.Mock).mockResolvedValue(1);

      await service.findAllByEmployee('emp-1', { page: 1, limit: 20, status: 'PENDING' });

      expect(prismaService.timeOffRequest.findMany).toHaveBeenCalledWith({
        where: { employeeId: 'emp-1', status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      });
      expect(prismaService.timeOffRequest.count).toHaveBeenCalledWith({
        where: { employeeId: 'emp-1', status: 'PENDING' },
      });
    });

    it('uses descending createdAt sort', async () => {
      const { service, prismaService } = createService();
      (prismaService.timeOffRequest.findMany as jest.Mock).mockResolvedValue([]);
      (prismaService.timeOffRequest.count as jest.Mock).mockResolvedValue(0);

      await service.findAllByEmployee('emp-1', { page: 1, limit: 20 });

      const call = (prismaService.timeOffRequest.findMany as jest.Mock).mock.calls[0][0];
      expect(call.orderBy).toEqual({ createdAt: 'desc' });
    });

    it('computes correct skip for page 2', async () => {
      const { service, prismaService } = createService();
      (prismaService.timeOffRequest.findMany as jest.Mock).mockResolvedValue([]);
      (prismaService.timeOffRequest.count as jest.Mock).mockResolvedValue(0);

      await service.findAllByEmployee('emp-1', { page: 2, limit: 10 });

      const call = (prismaService.timeOffRequest.findMany as jest.Mock).mock.calls[0][0];
      expect(call.skip).toBe(10);
      expect(call.take).toBe(10);
    });

    it('caps limit at 100', async () => {
      const { service, prismaService } = createService();
      (prismaService.timeOffRequest.findMany as jest.Mock).mockResolvedValue([]);
      (prismaService.timeOffRequest.count as jest.Mock).mockResolvedValue(0);

      const result = await service.findAllByEmployee('emp-1', { page: 1, limit: 999 });

      const call = (prismaService.timeOffRequest.findMany as jest.Mock).mock.calls[0][0];
      expect(call.take).toBe(100);
      expect(result.pagination.limit).toBe(100);
    });

    it('clamps page to minimum 1', async () => {
      const { service, prismaService } = createService();
      (prismaService.timeOffRequest.findMany as jest.Mock).mockResolvedValue([]);
      (prismaService.timeOffRequest.count as jest.Mock).mockResolvedValue(0);

      const result = await service.findAllByEmployee('emp-1', { page: 0, limit: 20 });

      const call = (prismaService.timeOffRequest.findMany as jest.Mock).mock.calls[0][0];
      expect(call.skip).toBe(0);
      expect(result.pagination.page).toBe(1);
    });

    it('returns totalPages: 0 when total is 0', async () => {
      const { service, prismaService } = createService();
      (prismaService.timeOffRequest.findMany as jest.Mock).mockResolvedValue([]);
      (prismaService.timeOffRequest.count as jest.Mock).mockResolvedValue(0);

      const result = await service.findAllByEmployee('emp-1', { page: 1, limit: 20 });

      expect(result.pagination.totalPages).toBe(0);
    });
  });
});
