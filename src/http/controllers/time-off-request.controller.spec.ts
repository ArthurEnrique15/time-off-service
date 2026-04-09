import { BadRequestException, NotFoundException } from '@nestjs/common';

import type { TimeOffRequestService, PaginatedRequestList } from '@core/services/time-off-request.service';

import { TimeOffRequestController } from '@http/controllers/time-off-request.controller';

describe('TimeOffRequestController', () => {
  const mockRequest = {
    id: 'req-1',
    employeeId: 'emp-1',
    locationId: 'loc-1',
    startDate: new Date('2026-06-01'),
    endDate: new Date('2026-06-05'),
    status: 'PENDING',
    createdAt: new Date('2026-05-01T10:00:00Z'),
    updatedAt: new Date('2026-05-01T10:00:00Z'),
  };

  const mockPaginatedResponse: PaginatedRequestList = {
    data: [mockRequest],
    pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
  };

  const createController = () => {
    const timeOffRequestService = {
      findById: jest.fn().mockResolvedValue(mockRequest),
      findAllByEmployee: jest.fn().mockResolvedValue(mockPaginatedResponse),
    } as unknown as TimeOffRequestService;

    const controller = new TimeOffRequestController(timeOffRequestService);

    return { controller, timeOffRequestService };
  };

  describe('findOne', () => {
    it('returns the request when found', async () => {
      const { controller, timeOffRequestService } = createController();

      const result = await controller.findOne('req-1');

      expect(result).toEqual(mockRequest);
      expect(timeOffRequestService.findById).toHaveBeenCalledWith('req-1');
    });

    it('throws NotFoundException when request not found', async () => {
      const { controller, timeOffRequestService } = createController();
      (timeOffRequestService.findById as jest.Mock).mockResolvedValue(null);

      await expect(controller.findOne('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('delegates to service with parsed params', async () => {
      const { controller, timeOffRequestService } = createController();

      const result = await controller.findAll('emp-1', 'PENDING', '2', '10');

      expect(result).toEqual(mockPaginatedResponse);
      expect(timeOffRequestService.findAllByEmployee).toHaveBeenCalledWith('emp-1', {
        page: 2,
        limit: 10,
        status: 'PENDING',
      });
    });

    it('uses default page=1 and limit=20 when not provided', async () => {
      const { controller, timeOffRequestService } = createController();

      await controller.findAll('emp-1', undefined, undefined, undefined);

      expect(timeOffRequestService.findAllByEmployee).toHaveBeenCalledWith('emp-1', {
        page: 1,
        limit: 20,
        status: undefined,
      });
    });

    it('throws BadRequestException when employeeId is missing', async () => {
      const { controller } = createController();

      await expect(controller.findAll(undefined as any, undefined, undefined, undefined)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException for invalid status', async () => {
      const { controller } = createController();

      await expect(controller.findAll('emp-1', 'INVALID', undefined, undefined)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('passes undefined status when not provided (returns all)', async () => {
      const { controller, timeOffRequestService } = createController();

      await controller.findAll('emp-1', undefined, undefined, undefined);

      const call = (timeOffRequestService.findAllByEmployee as jest.Mock).mock.calls[0][1];
      expect(call.status).toBeUndefined();
    });
  });
});
