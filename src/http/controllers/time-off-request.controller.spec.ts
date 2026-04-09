import { Test, TestingModule } from '@nestjs/testing';

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
    hcmRequestId: 'hcm-req-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockTimeOffRequestService = {
    create: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

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
});
