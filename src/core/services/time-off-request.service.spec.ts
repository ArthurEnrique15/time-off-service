import { BadRequestException, NotFoundException, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '@app-prisma/prisma.service';
import { BalanceAuditService } from '@core/services/balance-audit.service';
import { BalanceService } from '@core/services/balance.service';
import { TimeOffRequestService } from '@core/services/time-off-request.service';
import { InsufficientBalanceError } from '@shared/errors/insufficient-balance.error';
import { Failure, Success } from '@shared/core/either';
import { HcmClient } from '@shared/providers/hcm/hcm.client';

describe('TimeOffRequestService', () => {
  let service: TimeOffRequestService;

  const mockBalance = {
    id: 'balance-1',
    employeeId: 'emp-1',
    locationId: 'loc-1',
    availableDays: 20,
    reservedDays: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

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

  const mockBalanceService = {
    findByEmployeeAndLocation: jest.fn(),
  };

  const mockBalanceAuditService = {
    recordEntry: jest.fn(),
  };

  const mockHcmClient = {
    submitTimeOff: jest.fn(),
  };

  const mockPrismaService = {
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Default: transaction runs the callback with a tx that has balance + timeOffRequest
    mockPrismaService.$transaction.mockImplementation(async (cb: (tx: any) => Promise<any>) => {
      const tx = {
        balance: {
          findUnique: jest.fn().mockResolvedValue(mockBalance),
          update: jest.fn().mockResolvedValue({ ...mockBalance, availableDays: 15, reservedDays: 5 }),
        },
        timeOffRequest: {
          create: jest.fn().mockResolvedValue(mockRequest),
        },
      };
      return cb(tx);
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TimeOffRequestService,
        { provide: BalanceService, useValue: mockBalanceService },
        { provide: BalanceAuditService, useValue: mockBalanceAuditService },
        { provide: HcmClient, useValue: mockHcmClient },
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<TimeOffRequestService>(TimeOffRequestService);
  });

  const validDto = {
    employeeId: 'emp-1',
    locationId: 'loc-1',
    startDate: '2025-06-01',
    endDate: '2025-06-05',
  };

  describe('create — happy path', () => {
    it('returns the created TimeOffRequest', async () => {
      mockBalanceService.findByEmployeeAndLocation.mockResolvedValue(mockBalance);
      mockHcmClient.submitTimeOff.mockResolvedValue(Success.create({ id: 'hcm-req-1', status: 'APPROVED' }));

      const result = await service.create(validDto);

      expect(result).toEqual(mockRequest);
    });

    it('calls BalanceAuditService.recordEntry with RESERVATION reason', async () => {
      mockBalanceService.findByEmployeeAndLocation.mockResolvedValue(mockBalance);
      mockHcmClient.submitTimeOff.mockResolvedValue(Success.create({ id: 'hcm-req-1', status: 'APPROVED' }));
      mockBalanceAuditService.recordEntry.mockResolvedValue({});

      await service.create(validDto);

      expect(mockBalanceAuditService.recordEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          balanceId: 'balance-1',
          delta: -5,
          reason: 'RESERVATION',
          requestId: 'req-1',
        }),
      );
    });

    it('calls HcmClient.submitTimeOff with the correct request data', async () => {
      mockBalanceService.findByEmployeeAndLocation.mockResolvedValue(mockBalance);
      mockHcmClient.submitTimeOff.mockResolvedValue(Success.create({ id: 'hcm-req-1', status: 'APPROVED' }));

      await service.create(validDto);

      expect(mockHcmClient.submitTimeOff).toHaveBeenCalledWith({
        employeeId: 'emp-1',
        locationId: 'loc-1',
        startDate: '2025-06-01',
        endDate: '2025-06-05',
      });
    });

    it('stores hcmRequestId from HCM response on the created request', async () => {
      mockBalanceService.findByEmployeeAndLocation.mockResolvedValue(mockBalance);
      mockHcmClient.submitTimeOff.mockResolvedValue(Success.create({ id: 'hcm-req-99', status: 'APPROVED' }));

      mockPrismaService.$transaction.mockImplementation(async (cb: (tx: any) => Promise<any>) => {
        const tx = {
          balance: {
            findUnique: jest.fn().mockResolvedValue(mockBalance),
            update: jest.fn().mockResolvedValue(mockBalance),
          },
          timeOffRequest: {
            create: jest.fn().mockImplementation(({ data }: any) =>
              Promise.resolve({ ...mockRequest, hcmRequestId: data.hcmRequestId }),
            ),
          },
        };
        return cb(tx);
      });

      const result = await service.create(validDto);

      expect(result.hcmRequestId).toBe('hcm-req-99');
    });
  });

  describe('create — date validation', () => {
    it('throws BadRequestException when startDate is after endDate', async () => {
      await expect(
        service.create({ ...validDto, startDate: '2025-06-10', endDate: '2025-06-05' }),
      ).rejects.toThrow(BadRequestException);

      expect(mockHcmClient.submitTimeOff).not.toHaveBeenCalled();
    });
  });

  describe('create — local balance check', () => {
    it('throws NotFoundException when balance does not exist', async () => {
      mockBalanceService.findByEmployeeAndLocation.mockResolvedValue(null);

      await expect(service.create(validDto)).rejects.toThrow(NotFoundException);
      expect(mockHcmClient.submitTimeOff).not.toHaveBeenCalled();
    });

    it('throws InsufficientBalanceError when available days < days requested', async () => {
      mockBalanceService.findByEmployeeAndLocation.mockResolvedValue({
        ...mockBalance,
        availableDays: 2,
      });

      await expect(service.create(validDto)).rejects.toThrow(InsufficientBalanceError);
      expect(mockHcmClient.submitTimeOff).not.toHaveBeenCalled();
    });
  });

  describe('create — in-transaction safety checks', () => {
    it('throws NotFoundException when balance disappears inside the transaction', async () => {
      mockBalanceService.findByEmployeeAndLocation.mockResolvedValue(mockBalance);
      mockHcmClient.submitTimeOff.mockResolvedValue(Success.create({ id: 'hcm-req-1', status: 'APPROVED' }));

      mockPrismaService.$transaction.mockImplementation(async (cb: (tx: any) => Promise<any>) => {
        const tx = {
          balance: { findUnique: jest.fn().mockResolvedValue(null) },
          timeOffRequest: { create: jest.fn() },
        };
        return cb(tx);
      });

      await expect(service.create(validDto)).rejects.toThrow(NotFoundException);
    });

    it('throws InsufficientBalanceError when balance becomes insufficient inside the transaction', async () => {
      mockBalanceService.findByEmployeeAndLocation.mockResolvedValue(mockBalance);
      mockHcmClient.submitTimeOff.mockResolvedValue(Success.create({ id: 'hcm-req-1', status: 'APPROVED' }));

      mockPrismaService.$transaction.mockImplementation(async (cb: (tx: any) => Promise<any>) => {
        const tx = {
          balance: { findUnique: jest.fn().mockResolvedValue({ ...mockBalance, availableDays: 1 }) },
          timeOffRequest: { create: jest.fn() },
        };
        return cb(tx);
      });

      await expect(service.create(validDto)).rejects.toThrow(InsufficientBalanceError);
    });
  });

  describe('create — HCM error mapping', () => {
    it('throws BadRequestException when HCM returns INSUFFICIENT_BALANCE', async () => {
      mockBalanceService.findByEmployeeAndLocation.mockResolvedValue(mockBalance);
      mockHcmClient.submitTimeOff.mockResolvedValue(
        Failure.create({ code: 'INSUFFICIENT_BALANCE', message: 'not enough', statusCode: 400 }),
      );

      await expect(service.create(validDto)).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });

    it('throws UnprocessableEntityException when HCM returns INVALID_DIMENSIONS', async () => {
      mockBalanceService.findByEmployeeAndLocation.mockResolvedValue(mockBalance);
      mockHcmClient.submitTimeOff.mockResolvedValue(
        Failure.create({ code: 'INVALID_DIMENSIONS', message: 'bad dims', statusCode: 400 }),
      );

      await expect(service.create(validDto)).rejects.toThrow(UnprocessableEntityException);
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });

    it('throws ServiceUnavailableException when HCM returns UNKNOWN', async () => {
      mockBalanceService.findByEmployeeAndLocation.mockResolvedValue(mockBalance);
      mockHcmClient.submitTimeOff.mockResolvedValue(
        Failure.create({ code: 'UNKNOWN', message: 'network error', statusCode: 500 }),
      );

      await expect(service.create(validDto)).rejects.toThrow(ServiceUnavailableException);
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });
  });
});
