import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { parseISO } from 'date-fns';

import { PrismaService } from '@app-prisma/prisma.service';

import { BalanceAuditService } from '@core/services/balance-audit.service';
import { BalanceService } from '@core/services/balance.service';
import { TimeOffRequestService } from '@core/services/time-off-request.service';

import { Failure, Success } from '@shared/core/either';
import { InsufficientBalanceError } from '@shared/errors/insufficient-balance.error';
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
    confirmDeductionInTx: jest.fn(),
    releaseReservationInTx: jest.fn(),
  };

  const mockBalanceAuditService = {
    recordEntryInTx: jest.fn(),
  };

  const mockHcmClient = {
    submitTimeOff: jest.fn(),
    cancelTimeOff: jest.fn().mockResolvedValue(Success.create(undefined)),
  };

  const mockTx = {
    timeOffRequest: {
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockPrismaService = {
    $transaction: jest.fn(),
    timeOffRequest: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockBalanceService.reserveInTx.mockResolvedValue(updatedBalance);
    mockBalanceAuditService.recordEntryInTx.mockResolvedValue({});
    mockHcmClient.cancelTimeOff.mockResolvedValue(Success.create(undefined));

    mockTx.timeOffRequest.create.mockResolvedValue(mockRequest);
    mockTx.timeOffRequest.update.mockResolvedValue(mockRequest);

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
            create: jest
              .fn()
              .mockImplementation(({ data }: any) =>
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
      await expect(service.create({ ...validDto, startDate: '2025-06-10', endDate: '2025-06-05' })).rejects.toThrow(
        'startDate must be before or equal to endDate',
      );

      expect(mockHcmClient.submitTimeOff).not.toHaveBeenCalled();
    });
  });

  describe('create — local balance check', () => {
    it('throws NotFoundException when balance does not exist', async () => {
      mockBalanceService.findByEmployeeAndLocation.mockResolvedValue(null);

      await expect(service.create(validDto)).rejects.toThrow('Balance not found for employee emp-1 at location loc-1');
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

      await expect(service.create(validDto)).rejects.toThrow('Balance not found for employee emp-1 at location loc-1');
    });

    it('throws InsufficientBalanceError when balance becomes insufficient inside the transaction', async () => {
      mockBalanceService.findByEmployeeAndLocation.mockResolvedValue(mockBalance);
      mockHcmClient.submitTimeOff.mockResolvedValue(Success.create({ id: 'hcm-req-1', status: 'APPROVED' }));
      mockBalanceService.reserveInTx.mockRejectedValueOnce(new InsufficientBalanceError('emp-1', 'loc-1', 5, 1));

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

describe('TimeOffRequestService — approve', () => {
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

  const approvedRequest = { ...mockRequest, status: 'APPROVED' };

  const mockBalance = {
    id: 'balance-1',
    employeeId: 'emp-1',
    locationId: 'loc-1',
    availableDays: 15,
    reservedDays: 5,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockTx = {
    timeOffRequest: {
      update: jest.fn(),
    },
  };

  const mockPrismaService = {
    timeOffRequest: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn((cb: (tx: any) => Promise<any>) => cb(mockTx)),
  };

  const mockBalanceService = {
    confirmDeductionInTx: jest.fn(),
  };

  const mockBalanceAuditService = {
    recordEntryInTx: jest.fn(),
  };

  const createService = () =>
    new TimeOffRequestService(
      mockPrismaService as any,
      mockBalanceService as any,
      mockBalanceAuditService as any,
      {} as any,
    );

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrismaService.timeOffRequest.findUnique.mockResolvedValue(mockRequest);
    mockTx.timeOffRequest.update.mockResolvedValue(approvedRequest);
    mockBalanceService.confirmDeductionInTx.mockResolvedValue(mockBalance);
    mockBalanceAuditService.recordEntryInTx.mockResolvedValue({});
  });

  it('throws NotFoundException when request is not found', async () => {
    mockPrismaService.timeOffRequest.findUnique.mockResolvedValue(null);
    const service = createService();

    await expect(service.approve('req-missing')).rejects.toThrow(
      new NotFoundException('Time-off request req-missing not found'),
    );
  });

  it('throws ConflictException when request status is APPROVED', async () => {
    mockPrismaService.timeOffRequest.findUnique.mockResolvedValue({ ...mockRequest, status: 'APPROVED' });
    const service = createService();

    await expect(service.approve('req-1')).rejects.toThrow(new ConflictException('Cannot approve a APPROVED request'));
  });

  it('throws ConflictException when request status is REJECTED', async () => {
    mockPrismaService.timeOffRequest.findUnique.mockResolvedValue({ ...mockRequest, status: 'REJECTED' });
    const service = createService();

    await expect(service.approve('req-1')).rejects.toThrow(new ConflictException('Cannot approve a REJECTED request'));
  });

  it('throws ConflictException when request status is CANCELLED', async () => {
    mockPrismaService.timeOffRequest.findUnique.mockResolvedValue({ ...mockRequest, status: 'CANCELLED' });
    const service = createService();

    await expect(service.approve('req-1')).rejects.toThrow(new ConflictException('Cannot approve a CANCELLED request'));
  });

  it('calls tx.timeOffRequest.update with APPROVED, calls confirmDeductionInTx, calls recordEntryInTx with APPROVAL_DEDUCTION and delta -days', async () => {
    const service = createService();

    const result = await service.approve('req-1');

    expect(mockTx.timeOffRequest.update).toHaveBeenCalledWith({
      where: { id: 'req-1' },
      data: { status: 'APPROVED' },
    });
    expect(mockBalanceService.confirmDeductionInTx).toHaveBeenCalledWith(mockTx, 'emp-1', 'loc-1', 5);
    expect(mockBalanceAuditService.recordEntryInTx).toHaveBeenCalledWith(mockTx, {
      balanceId: 'balance-1',
      delta: -5,
      reason: 'APPROVAL_DEDUCTION',
      requestId: 'req-1',
      actorId: undefined,
    });
    expect(result).toEqual(approvedRequest);
  });

  it('forwards actorId to recordEntryInTx', async () => {
    const service = createService();

    await service.approve('req-1', 'manager-42');

    expect(mockBalanceAuditService.recordEntryInTx).toHaveBeenCalledWith(mockTx, {
      balanceId: 'balance-1',
      delta: -5,
      reason: 'APPROVAL_DEDUCTION',
      requestId: 'req-1',
      actorId: 'manager-42',
    });
  });
});

describe('TimeOffRequestService — reject', () => {
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

  const rejectedRequest = { ...mockRequest, status: 'REJECTED' };

  const mockBalance = {
    id: 'balance-1',
    employeeId: 'emp-1',
    locationId: 'loc-1',
    availableDays: 20,
    reservedDays: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockTx = {
    timeOffRequest: {
      update: jest.fn(),
    },
  };

  const mockPrismaService = {
    timeOffRequest: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn((cb: (tx: any) => Promise<any>) => cb(mockTx)),
  };

  const mockBalanceService = {
    releaseReservationInTx: jest.fn(),
  };

  const mockBalanceAuditService = {
    recordEntryInTx: jest.fn(),
  };

  const createService = () =>
    new TimeOffRequestService(
      mockPrismaService as any,
      mockBalanceService as any,
      mockBalanceAuditService as any,
      {} as any,
    );

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrismaService.timeOffRequest.findUnique.mockResolvedValue(mockRequest);
    mockTx.timeOffRequest.update.mockResolvedValue(rejectedRequest);
    mockBalanceService.releaseReservationInTx.mockResolvedValue(mockBalance);
    mockBalanceAuditService.recordEntryInTx.mockResolvedValue({});
  });

  it('throws NotFoundException when request is not found', async () => {
    mockPrismaService.timeOffRequest.findUnique.mockResolvedValue(null);
    const service = createService();

    await expect(service.reject('req-missing')).rejects.toThrow(
      new NotFoundException('Time-off request req-missing not found'),
    );
  });

  it('throws ConflictException when request status is APPROVED', async () => {
    mockPrismaService.timeOffRequest.findUnique.mockResolvedValue({ ...mockRequest, status: 'APPROVED' });
    const service = createService();

    await expect(service.reject('req-1')).rejects.toThrow(new ConflictException('Cannot reject a APPROVED request'));
  });

  it('throws ConflictException when request status is REJECTED', async () => {
    mockPrismaService.timeOffRequest.findUnique.mockResolvedValue({ ...mockRequest, status: 'REJECTED' });
    const service = createService();

    await expect(service.reject('req-1')).rejects.toThrow(new ConflictException('Cannot reject a REJECTED request'));
  });

  it('throws ConflictException when request status is CANCELLED', async () => {
    mockPrismaService.timeOffRequest.findUnique.mockResolvedValue({ ...mockRequest, status: 'CANCELLED' });
    const service = createService();

    await expect(service.reject('req-1')).rejects.toThrow(new ConflictException('Cannot reject a CANCELLED request'));
  });

  it('calls tx.timeOffRequest.update with REJECTED, calls releaseReservationInTx, calls recordEntryInTx with RESERVATION_RELEASE and delta +days', async () => {
    const service = createService();

    const result = await service.reject('req-1');

    expect(mockTx.timeOffRequest.update).toHaveBeenCalledWith({
      where: { id: 'req-1' },
      data: { status: 'REJECTED' },
    });
    expect(mockBalanceService.releaseReservationInTx).toHaveBeenCalledWith(mockTx, 'emp-1', 'loc-1', 5);
    expect(mockBalanceAuditService.recordEntryInTx).toHaveBeenCalledWith(mockTx, {
      balanceId: 'balance-1',
      delta: 5,
      reason: 'RESERVATION_RELEASE',
      requestId: 'req-1',
      actorId: undefined,
    });
    expect(result).toEqual(rejectedRequest);
  });

  it('forwards actorId to recordEntryInTx', async () => {
    const service = createService();

    await service.reject('req-1', 'manager-42');

    expect(mockBalanceAuditService.recordEntryInTx).toHaveBeenCalledWith(mockTx, {
      balanceId: 'balance-1',
      delta: 5,
      reason: 'RESERVATION_RELEASE',
      requestId: 'req-1',
      actorId: 'manager-42',
    });
  });
});

describe('TimeOffRequestService — cancel', () => {
  const mockRequest = {
    id: 'req-1',
    employeeId: 'emp-1',
    locationId: 'loc-1',
    startDate: new Date('2025-06-01'),
    endDate: new Date('2025-06-05'),
    status: 'APPROVED',
    hcmRequestId: 'hcm-req-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const cancelledRequest = { ...mockRequest, status: 'CANCELLED' };

  const mockBalance = {
    id: 'balance-1',
    employeeId: 'emp-1',
    locationId: 'loc-1',
    availableDays: 20,
    reservedDays: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockTx = {
    timeOffRequest: {
      update: jest.fn(),
    },
  };

  const mockPrismaService = {
    timeOffRequest: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn((cb: (tx: any) => Promise<any>) => cb(mockTx)),
  };

  const mockBalanceService = {
    restoreBalanceInTx: jest.fn(),
  };

  const mockBalanceAuditService = {
    recordEntryInTx: jest.fn(),
  };

  const mockHcmClient = {
    cancelTimeOff: jest.fn(),
  };

  const createService = () =>
    new TimeOffRequestService(
      mockPrismaService as any,
      mockBalanceService as any,
      mockBalanceAuditService as any,
      mockHcmClient as any,
    );

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrismaService.timeOffRequest.findUnique.mockResolvedValue(mockRequest);
    mockTx.timeOffRequest.update.mockResolvedValue(cancelledRequest);
    mockBalanceService.restoreBalanceInTx.mockResolvedValue(mockBalance);
    mockBalanceAuditService.recordEntryInTx.mockResolvedValue({});
    mockHcmClient.cancelTimeOff.mockResolvedValue(Success.create(undefined));
  });

  it('throws NotFoundException when request is not found', async () => {
    mockPrismaService.timeOffRequest.findUnique.mockResolvedValue(null);
    const service = createService();

    await expect(service.cancel('req-missing')).rejects.toThrow(
      new NotFoundException('Time-off request req-missing not found'),
    );
  });

  it('throws ConflictException when request status is PENDING', async () => {
    mockPrismaService.timeOffRequest.findUnique.mockResolvedValue({ ...mockRequest, status: 'PENDING' });
    const service = createService();

    await expect(service.cancel('req-1')).rejects.toThrow(new ConflictException('Cannot cancel a PENDING request'));
  });

  it('throws ConflictException when request status is REJECTED', async () => {
    mockPrismaService.timeOffRequest.findUnique.mockResolvedValue({ ...mockRequest, status: 'REJECTED' });
    const service = createService();

    await expect(service.cancel('req-1')).rejects.toThrow(new ConflictException('Cannot cancel a REJECTED request'));
  });

  it('throws ConflictException when request status is CANCELLED', async () => {
    mockPrismaService.timeOffRequest.findUnique.mockResolvedValue({ ...mockRequest, status: 'CANCELLED' });
    const service = createService();

    await expect(service.cancel('req-1')).rejects.toThrow(new ConflictException('Cannot cancel a CANCELLED request'));
  });

  it('throws ConflictException when an approved request has no hcmRequestId', async () => {
    mockPrismaService.timeOffRequest.findUnique.mockResolvedValue({ ...mockRequest, hcmRequestId: null });
    const service = createService();

    await expect(service.cancel('req-1')).rejects.toThrow(
      new ConflictException('Cannot cancel request req-1 without an HCM request ID'),
    );
  });

  it('calls HCM cancellation first, updates the request, restores balance, and records CANCELLATION_RESTORE', async () => {
    const service = createService();

    const result = await service.cancel('req-1');

    expect(mockHcmClient.cancelTimeOff).toHaveBeenCalledWith('hcm-req-1');
    expect(mockTx.timeOffRequest.update).toHaveBeenCalledWith({
      where: { id: 'req-1' },
      data: { status: 'CANCELLED' },
    });
    expect(mockBalanceService.restoreBalanceInTx).toHaveBeenCalledWith(mockTx, 'emp-1', 'loc-1', 5);
    expect(mockBalanceAuditService.recordEntryInTx).toHaveBeenCalledWith(mockTx, {
      balanceId: 'balance-1',
      delta: 5,
      reason: 'CANCELLATION_RESTORE',
      requestId: 'req-1',
      actorId: undefined,
    });
    expect(result).toEqual(cancelledRequest);
  });

  it('forwards actorId to recordEntryInTx', async () => {
    const service = createService();

    await service.cancel('req-1', 'manager-42');

    expect(mockBalanceAuditService.recordEntryInTx).toHaveBeenCalledWith(mockTx, {
      balanceId: 'balance-1',
      delta: 5,
      reason: 'CANCELLATION_RESTORE',
      requestId: 'req-1',
      actorId: 'manager-42',
    });
  });

  it('throws ConflictException when HCM returns NOT_FOUND and does not start a transaction', async () => {
    mockHcmClient.cancelTimeOff.mockResolvedValue(
      Failure.create({ code: 'NOT_FOUND', message: 'missing remote request', statusCode: 404 }),
    );
    const service = createService();

    await expect(service.cancel('req-1')).rejects.toThrow(
      new ConflictException('Remote HCM request hcm-req-1 was not found'),
    );
    expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
  });

  it('throws ServiceUnavailableException when HCM returns UNKNOWN and does not start a transaction', async () => {
    mockHcmClient.cancelTimeOff.mockResolvedValue(
      Failure.create({ code: 'UNKNOWN', message: 'network error', statusCode: 500 }),
    );
    const service = createService();

    await expect(service.cancel('req-1')).rejects.toThrow(
      new ServiceUnavailableException('HCM service is unavailable'),
    );
    expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
  });
});

describe('TimeOffRequestService — read', () => {
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

  const createService = () => {
    const prismaService = {
      timeOffRequest: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
    } as unknown as PrismaService;

    const service = new TimeOffRequestService(prismaService, {} as any, {} as any, {} as any);

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
      expect(call.where).toStrictEqual({ employeeId: 'emp-1' });
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
