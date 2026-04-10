import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import type { PaginatedRequestList } from '@core/services/time-off-request.service';
import { TimeOffRequestService } from '@core/services/time-off-request.service';

import { TimeOffRequestController } from '@http/controllers/time-off-request.controller';
import type { CreateTimeOffRequestDto } from '@http/dtos/create-time-off-request.dto';

describe('TimeOffRequestController', () => {
  let controller: TimeOffRequestController;

  const mockRequest = {
    id: 'req-1',
    employeeId: 'emp-1',
    locationId: 'loc-1',
    startDate: new Date('2025-06-01'),
    endDate: new Date('2025-06-05'),
    status: 'PENDING',
    hcmRequestId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPaginatedResponse: PaginatedRequestList = {
    data: [mockRequest],
    pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
  };

  const mockTimeOffRequestService = {
    create: jest.fn(),
    findById: jest.fn().mockResolvedValue(mockRequest),
    findAllByEmployee: jest.fn().mockResolvedValue(mockPaginatedResponse),
    approve: jest.fn(),
    reject: jest.fn(),
    cancel: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockTimeOffRequestService.findById.mockResolvedValue(mockRequest);
    mockTimeOffRequestService.findAllByEmployee.mockResolvedValue(mockPaginatedResponse);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TimeOffRequestController],
      providers: [{ provide: TimeOffRequestService, useValue: mockTimeOffRequestService }],
    }).compile();

    controller = module.get<TimeOffRequestController>(TimeOffRequestController);
  });

  describe('create', () => {
    it('delegates to TimeOffRequestService.create and returns the result', async () => {
      const dto: CreateTimeOffRequestDto = {
        employeeId: 'emp-1',
        locationId: 'loc-1',
        startDate: '2025-06-01',
        endDate: '2025-06-05',
      };
      mockTimeOffRequestService.create.mockResolvedValue(mockRequest);

      const result = await controller.create(dto);

      expect(result).toEqual(mockRequest);
      expect(mockTimeOffRequestService.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('findOne', () => {
    it('returns the request when found', async () => {
      const result = await controller.findOne('req-1');

      expect(result).toEqual(mockRequest);
      expect(mockTimeOffRequestService.findById).toHaveBeenCalledWith('req-1');
    });

    it('throws NotFoundException when request not found', async () => {
      mockTimeOffRequestService.findById.mockResolvedValue(null);

      await expect(controller.findOne('nonexistent')).rejects.toThrow('Time-off request nonexistent not found');
    });
  });

  describe('findAll', () => {
    it('delegates to service with parsed params', async () => {
      const result = await controller.findAll('emp-1', 'PENDING', '2', '10');

      expect(result).toEqual(mockPaginatedResponse);
      expect(mockTimeOffRequestService.findAllByEmployee).toHaveBeenCalledWith('emp-1', {
        page: 2,
        limit: 10,
        status: 'PENDING',
      });
    });

    it('uses default page=1 and limit=20 when not provided', async () => {
      await controller.findAll('emp-1', undefined, undefined, undefined);

      expect(mockTimeOffRequestService.findAllByEmployee).toHaveBeenCalledWith('emp-1', {
        page: 1,
        limit: 20,
        status: undefined,
      });
    });

    it('throws BadRequestException when employeeId is missing', async () => {
      await expect(controller.findAll(undefined as any, undefined, undefined, undefined)).rejects.toThrow(
        'employeeId query parameter is required',
      );
    });

    it('throws BadRequestException for invalid status', async () => {
      await expect(controller.findAll('emp-1', 'INVALID', undefined, undefined)).rejects.toThrow(
        'Invalid status: INVALID. Must be one of PENDING, APPROVED, REJECTED, CANCELLED',
      );
    });

    it('passes undefined status when not provided (returns all)', async () => {
      await controller.findAll('emp-1', undefined, undefined, undefined);

      const call = (mockTimeOffRequestService.findAllByEmployee as jest.Mock).mock.calls[0][1];
      expect(call.status).toBeUndefined();
    });

    it('uses default page when page is NaN', async () => {
      await controller.findAll('emp-1', undefined, 'abc', undefined);

      const call = (mockTimeOffRequestService.findAllByEmployee as jest.Mock).mock.calls[0][1];
      expect(call.page).toBe(1);
    });

    it('uses default limit when limit is NaN', async () => {
      await controller.findAll('emp-1', undefined, undefined, 'xyz');

      const call = (mockTimeOffRequestService.findAllByEmployee as jest.Mock).mock.calls[0][1];
      expect(call.limit).toBe(20);
    });
  });

  describe('approve', () => {
    it('delegates to service with id and actorId, returns result', async () => {
      const approvedRequest = { ...mockRequest, status: 'APPROVED', hcmRequestId: 'hcm-req-approval-1' };
      mockTimeOffRequestService.approve.mockResolvedValue(approvedRequest);

      const result = await controller.approve('req-1', { actorId: 'manager-1' });

      expect(result).toEqual(approvedRequest);
      expect(mockTimeOffRequestService.approve).toHaveBeenCalledWith('req-1', 'manager-1');
    });

    it('propagates NotFoundException from service', async () => {
      mockTimeOffRequestService.approve.mockRejectedValue(new NotFoundException('Time-off request req-1 not found'));

      await expect(controller.approve('nonexistent', { actorId: 'manager-1' })).rejects.toThrow(NotFoundException);
    });

    it('propagates ConflictException from service', async () => {
      mockTimeOffRequestService.approve.mockRejectedValue(new ConflictException('Cannot approve a APPROVED request'));

      await expect(controller.approve('req-1', { actorId: 'manager-1' })).rejects.toThrow(ConflictException);
    });

    it('propagates BadRequestException (400) from service', async () => {
      mockTimeOffRequestService.approve.mockRejectedValue(new BadRequestException('Insufficient balance in HCM'));

      await expect(controller.approve('req-1', { actorId: 'manager-1' })).rejects.toThrow(BadRequestException);
    });

    it('propagates UnprocessableEntityException (422) from service', async () => {
      mockTimeOffRequestService.approve.mockRejectedValue(
        new UnprocessableEntityException('Invalid dimensions in HCM'),
      );

      await expect(controller.approve('req-1', { actorId: 'manager-1' })).rejects.toThrow(UnprocessableEntityException);
    });

    it('propagates ServiceUnavailableException (503) from service', async () => {
      mockTimeOffRequestService.approve.mockRejectedValue(
        new ServiceUnavailableException('HCM service is unavailable'),
      );

      await expect(controller.approve('req-1', { actorId: 'manager-1' })).rejects.toThrow(ServiceUnavailableException);
    });
  });

  describe('reject', () => {
    it('delegates to service with id and actorId, returns result', async () => {
      const rejectedRequest = { ...mockRequest, status: 'REJECTED' };
      mockTimeOffRequestService.reject.mockResolvedValue(rejectedRequest);

      const result = await controller.reject('req-1', { actorId: 'manager-1' });

      expect(result).toEqual(rejectedRequest);
      expect(mockTimeOffRequestService.reject).toHaveBeenCalledWith('req-1', 'manager-1');
    });

    it('propagates NotFoundException from service', async () => {
      mockTimeOffRequestService.reject.mockRejectedValue(
        new NotFoundException('Time-off request nonexistent not found'),
      );

      await expect(controller.reject('nonexistent', { actorId: 'manager-1' })).rejects.toThrow(NotFoundException);
    });

    it('propagates ConflictException from service', async () => {
      mockTimeOffRequestService.reject.mockRejectedValue(new ConflictException('Cannot reject a REJECTED request'));

      await expect(controller.reject('req-1', { actorId: 'manager-1' })).rejects.toThrow(ConflictException);
    });
  });

  describe('cancel', () => {
    it('delegates to service with id and actorId, returns result', async () => {
      const cancelledRequest = { ...mockRequest, status: 'CANCELLED' };
      mockTimeOffRequestService.cancel.mockResolvedValue(cancelledRequest);

      const result = await controller.cancel('req-1', { actorId: 'manager-1' });

      expect(result).toEqual(cancelledRequest);
      expect(mockTimeOffRequestService.cancel).toHaveBeenCalledWith('req-1', 'manager-1');
    });

    it('propagates NotFoundException from service', async () => {
      mockTimeOffRequestService.cancel.mockRejectedValue(
        new NotFoundException('Time-off request nonexistent not found'),
      );

      await expect(controller.cancel('nonexistent', { actorId: 'manager-1' })).rejects.toThrow(NotFoundException);
    });

    it('propagates ConflictException from service', async () => {
      mockTimeOffRequestService.cancel.mockRejectedValue(new ConflictException('Cannot cancel a CANCELLED request'));

      await expect(controller.cancel('req-1', { actorId: 'manager-1' })).rejects.toThrow(ConflictException);
    });
  });
});
