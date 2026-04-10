import { BadRequestException, NotFoundException, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { parseISO } from 'date-fns';

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

  const updatedBalance = { ...mockBalance, availableDays: 15, reservedDays: 5 };

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
    reserveInTx: jest.fn(),
  };

  const mockBalanceAuditService = {
    recordEntryInTx: jest.fn(),
  };

  const mockHcmClient = {
    submitTimeOff: jest.fn(),
    cancelTimeOff: jest.fn().mockResolvedValue(Success.create(undefined)),
  };

  const mockPrismaService = {
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockBalanceService.reserveInTx.mockResolvedValue(updatedBalance);
    mockBalanceAuditService.recordEntryInTx.mockResolvedValue({});
    mockHcmClient.cancelTimeOff.mockResolvedValue(Success.create(undefined));

    mockPrismaService.$transaction.mockImplementation(async (cb: (tx: any) => Promise<any>) => {
      const tx = {
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

    it('calls BalanceAuditService.recordEntryInTx with RESERVATION reason', async () => {
      mockBalanceService.findByEmployeeAndLocation.mockResolvedValue(mockBalance);
      mockHcmClient.submitTimeOff.mockResolvedValue(Success.create({ id: 'hcm-req-1', status: 'APPROVED' }));

      await service.create(validDto);

      expect(mockBalanceAuditService.recordEntryInTx).toHaveBeenCalledWith(
        expect.anything(),
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
      ).rejects.toThrow('startDate must be before or equal to endDate');

      expect(mockHcmClient.submitTimeOff).not.toHaveBeenCalled();
    });
  });

  describe('create — local balance check', () => {
    it('throws NotFoundException when balance does not exist', async () => {
      mockBalanceService.findByEmployeeAndLocation.mockResolvedValue(null);

      await expect(service.create(validDto)).rejects.toThrow(
        'Balance not found for employee emp-1 at location loc-1',
      );
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

    it('does not throw when availableDays exactly equals days requested', async () => {
      mockBalanceService.findByEmployeeAndLocation.mockResolvedValue({
        ...mockBalance,
        availableDays: 5,
      });
      mockHcmClient.submitTimeOff.mockResolvedValue(Success.create({ id: 'hcm-req-1', status: 'APPROVED' }));

      await expect(service.create(validDto)).resolves.toBeDefined();
    });
  });

  describe('create — in-transaction safety checks', () => {
    it('throws NotFoundException when balance disappears inside the transaction', async () => {
      mockBalanceService.findByEmployeeAndLocation.mockResolvedValue(mockBalance);
      mockHcmClient.submitTimeOff.mockResolvedValue(Success.create({ id: 'hcm-req-1', status: 'APPROVED' }));
      mockBalanceService.reserveInTx.mockRejectedValueOnce(
        new NotFoundException('Balance not found for employee emp-1 at location loc-1'),
      );

      await expect(service.create(validDto)).rejects.toThrow(
        'Balance not found for employee emp-1 at location loc-1',
      );
    });

    it('throws InsufficientBalanceError when balance becomes insufficient inside the transaction', async () => {
      mockBalanceService.findByEmployeeAndLocation.mockResolvedValue(mockBalance);
      mockHcmClient.submitTimeOff.mockResolvedValue(Success.create({ id: 'hcm-req-1', status: 'APPROVED' }));
      mockBalanceService.reserveInTx.mockRejectedValueOnce(
        new InsufficientBalanceError('emp-1', 'loc-1', 5, 1),
      );

      await expect(service.create(validDto)).rejects.toThrow(InsufficientBalanceError);
    });

    it('does not throw when in-transaction balance exactly equals days requested', async () => {
      mockBalanceService.findByEmployeeAndLocation.mockResolvedValue(mockBalance);
      mockHcmClient.submitTimeOff.mockResolvedValue(Success.create({ id: 'hcm-req-1', status: 'APPROVED' }));

      await expect(service.create(validDto)).resolves.toBeDefined();
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

      await expect(service.create(validDto)).rejects.toThrow('HCM service is unavailable');
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('create — HCM compensation', () => {
    it('calls cancelTimeOff when the Prisma transaction fails after HCM submission succeeds', async () => {
      mockBalanceService.findByEmployeeAndLocation.mockResolvedValue(mockBalance);
      mockHcmClient.submitTimeOff.mockResolvedValue(Success.create({ id: 'hcm-req-1', status: 'APPROVED' }));
      mockPrismaService.$transaction.mockRejectedValueOnce(new Error('DB error'));

      await expect(service.create(validDto)).rejects.toThrow('DB error');
      expect(mockHcmClient.cancelTimeOff).toHaveBeenCalledWith('hcm-req-1');
    });

    it('does not call cancelTimeOff when HCM fails (before any transaction)', async () => {
      mockBalanceService.findByEmployeeAndLocation.mockResolvedValue(mockBalance);
      mockHcmClient.submitTimeOff.mockResolvedValue(
        Failure.create({ code: 'INSUFFICIENT_BALANCE', message: 'not enough', statusCode: 400 }),
      );

      await expect(service.create(validDto)).rejects.toThrow(BadRequestException);
      expect(mockHcmClient.cancelTimeOff).not.toHaveBeenCalled();
    });
  });

  describe('create — Prisma call assertions', () => {
    it('calls reserveInTx and recordEntryInTx with correct args, and creates request with PENDING status', async () => {
      mockBalanceService.findByEmployeeAndLocation.mockResolvedValue(mockBalance);
      mockHcmClient.submitTimeOff.mockResolvedValue(Success.create({ id: 'hcm-req-1', status: 'APPROVED' }));

      let capturedTx: any;
      mockPrismaService.$transaction.mockImplementation(async (cb: (tx: any) => Promise<any>) => {
        capturedTx = {
          timeOffRequest: {
            create: jest.fn().mockResolvedValue(mockRequest),
          },
        };
        return cb(capturedTx);
      });

      await service.create(validDto);

      expect(mockBalanceService.reserveInTx).toHaveBeenCalledWith(capturedTx, 'emp-1', 'loc-1', 5);

      expect(capturedTx.timeOffRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'PENDING',
            hcmRequestId: 'hcm-req-1',
          }),
        }),
      );

      expect(mockBalanceAuditService.recordEntryInTx).toHaveBeenCalledWith(capturedTx, {
        balanceId: 'balance-1',
        delta: -5,
        reason: 'RESERVATION',
        requestId: 'req-1',
      });
    });

    it('startDate and endDate are stored as Date objects (parseISO conversion)', async () => {
      mockBalanceService.findByEmployeeAndLocation.mockResolvedValue(mockBalance);
      mockHcmClient.submitTimeOff.mockResolvedValue(Success.create({ id: 'hcm-req-1', status: 'APPROVED' }));

      let capturedTx: any;
      mockPrismaService.$transaction.mockImplementation(async (cb: (tx: any) => Promise<any>) => {
        capturedTx = {
          timeOffRequest: {
            create: jest.fn().mockResolvedValue(mockRequest),
          },
        };
        return cb(capturedTx);
      });

      await service.create(validDto);

      const createCall = capturedTx.timeOffRequest.create.mock.calls[0][0];
      expect(createCall.data.startDate).toBeInstanceOf(Date);
      expect(createCall.data.endDate).toBeInstanceOf(Date);
      expect(createCall.data.startDate).toEqual(parseISO('2025-06-01'));
      expect(createCall.data.endDate).toEqual(parseISO('2025-06-05'));
    });
  });
});
