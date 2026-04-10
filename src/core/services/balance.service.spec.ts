import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '@app-prisma/prisma.service';

import { BalanceService } from '@core/services/balance.service';

import { InsufficientBalanceError } from '@shared/errors/insufficient-balance.error';

describe('BalanceService', () => {
  let service: BalanceService;

  const mockBalance = {
    id: 'balance-1',
    employeeId: 'emp-1',
    locationId: 'loc-1',
    availableDays: 20,
    reservedDays: 5,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPrismaService = {
    balance: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrismaService.$transaction.mockImplementation((cb: (tx: typeof mockPrismaService) => unknown) =>
      cb(mockPrismaService),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [BalanceService, { provide: PrismaService, useValue: mockPrismaService }],
    }).compile();

    service = module.get<BalanceService>(BalanceService);
  });

  describe('findByEmployeeAndLocation', () => {
    it('returns the balance when found', async () => {
      mockPrismaService.balance.findUnique.mockResolvedValue(mockBalance);

      const result = await service.findByEmployeeAndLocation('emp-1', 'loc-1');

      expect(result).toEqual(mockBalance);
      expect(mockPrismaService.balance.findUnique).toHaveBeenCalledWith({
        where: { employeeId_locationId: { employeeId: 'emp-1', locationId: 'loc-1' } },
      });
    });

    it('returns null when the balance does not exist', async () => {
      mockPrismaService.balance.findUnique.mockResolvedValue(null);

      const result = await service.findByEmployeeAndLocation('emp-1', 'loc-1');

      expect(result).toBeNull();
    });
  });

  describe('findAllByEmployee', () => {
    it('returns an array of balances for the employee', async () => {
      const balances = [mockBalance, { ...mockBalance, id: 'balance-2', locationId: 'loc-2' }];
      mockPrismaService.balance.findMany.mockResolvedValue(balances);

      const result = await service.findAllByEmployee('emp-1');

      expect(result).toEqual(balances);
      expect(mockPrismaService.balance.findMany).toHaveBeenCalledWith({
        where: { employeeId: 'emp-1' },
      });
    });

    it('returns an empty array when no balances exist', async () => {
      mockPrismaService.balance.findMany.mockResolvedValue([]);

      const result = await service.findAllByEmployee('emp-1');

      expect(result).toEqual([]);
    });
  });

  describe('reserve', () => {
    it('decreases available and increases reserved, returning the updated balance', async () => {
      const updatedBalance = { ...mockBalance, availableDays: 17, reservedDays: 8 };
      mockPrismaService.balance.findUnique.mockResolvedValue(mockBalance);
      mockPrismaService.balance.update.mockResolvedValue(updatedBalance);

      const result = await service.reserve('emp-1', 'loc-1', 3);

      expect(result).toEqual(updatedBalance);
      expect(mockPrismaService.balance.update).toHaveBeenCalledWith({
        where: { employeeId_locationId: { employeeId: 'emp-1', locationId: 'loc-1' } },
        data: {
          availableDays: { decrement: 3 },
          reservedDays: { increment: 3 },
        },
      });
    });

    it('throws NotFoundException when the balance does not exist', async () => {
      mockPrismaService.balance.findUnique.mockResolvedValue(null);

      await expect(service.reserve('emp-1', 'loc-1', 3)).rejects.toThrow(
        'Balance not found for employee emp-1 at location loc-1',
      );
      expect(mockPrismaService.balance.findUnique).toHaveBeenCalledWith({
        where: { employeeId_locationId: { employeeId: 'emp-1', locationId: 'loc-1' } },
      });
    });

    it('throws InsufficientBalanceError when available days are insufficient', async () => {
      mockPrismaService.balance.findUnique.mockResolvedValue({ ...mockBalance, availableDays: 2 });

      await expect(service.reserve('emp-1', 'loc-1', 5)).rejects.toThrow(InsufficientBalanceError);
    });

    it('succeeds when requesting exactly the available days', async () => {
      const exactBalance = { ...mockBalance, availableDays: 5, reservedDays: 0 };
      const updatedBalance = { ...exactBalance, availableDays: 0, reservedDays: 5 };
      mockPrismaService.balance.findUnique.mockResolvedValue(exactBalance);
      mockPrismaService.balance.update.mockResolvedValue(updatedBalance);

      const result = await service.reserve('emp-1', 'loc-1', 5);

      expect(result).toEqual(updatedBalance);
    });
  });

  describe('releaseReservation', () => {
    it('decreases reserved and increases available, returning the updated balance', async () => {
      const updatedBalance = { ...mockBalance, availableDays: 23, reservedDays: 2 };
      mockPrismaService.balance.findUnique.mockResolvedValue(mockBalance);
      mockPrismaService.balance.update.mockResolvedValue(updatedBalance);

      const result = await service.releaseReservation('emp-1', 'loc-1', 3);

      expect(result).toEqual(updatedBalance);
      expect(mockPrismaService.balance.update).toHaveBeenCalledWith({
        where: { employeeId_locationId: { employeeId: 'emp-1', locationId: 'loc-1' } },
        data: {
          reservedDays: { decrement: 3 },
          availableDays: { increment: 3 },
        },
      });
    });

    it('throws NotFoundException when the balance does not exist', async () => {
      mockPrismaService.balance.findUnique.mockResolvedValue(null);

      await expect(service.releaseReservation('emp-1', 'loc-1', 3)).rejects.toThrow(NotFoundException);
    });

    it('throws InsufficientBalanceError when reserved days are insufficient', async () => {
      mockPrismaService.balance.findUnique.mockResolvedValue({ ...mockBalance, reservedDays: 1 });

      await expect(service.releaseReservation('emp-1', 'loc-1', 5)).rejects.toThrow(InsufficientBalanceError);
    });

    it('succeeds when releasing exactly the reserved days', async () => {
      const exactReserved = { ...mockBalance, reservedDays: 3, availableDays: 10 };
      const updatedBalance = { ...exactReserved, reservedDays: 0, availableDays: 13 };
      mockPrismaService.balance.findUnique.mockResolvedValue(exactReserved);
      mockPrismaService.balance.update.mockResolvedValue(updatedBalance);

      const result = await service.releaseReservation('emp-1', 'loc-1', 3);

      expect(result).toEqual(updatedBalance);
    });
  });

  describe('confirmDeduction', () => {
    it('decreases reserved days permanently, returning the updated balance', async () => {
      const updatedBalance = { ...mockBalance, reservedDays: 2 };
      mockPrismaService.balance.findUnique.mockResolvedValue(mockBalance);
      mockPrismaService.balance.update.mockResolvedValue(updatedBalance);

      const result = await service.confirmDeduction('emp-1', 'loc-1', 3);

      expect(result).toEqual(updatedBalance);
      expect(mockPrismaService.balance.update).toHaveBeenCalledWith({
        where: { employeeId_locationId: { employeeId: 'emp-1', locationId: 'loc-1' } },
        data: {
          reservedDays: { decrement: 3 },
        },
      });
    });

    it('throws NotFoundException when the balance does not exist', async () => {
      mockPrismaService.balance.findUnique.mockResolvedValue(null);

      await expect(service.confirmDeduction('emp-1', 'loc-1', 3)).rejects.toThrow(NotFoundException);
    });

    it('throws InsufficientBalanceError when reserved days are insufficient', async () => {
      mockPrismaService.balance.findUnique.mockResolvedValue({ ...mockBalance, reservedDays: 1 });

      await expect(service.confirmDeduction('emp-1', 'loc-1', 5)).rejects.toThrow(InsufficientBalanceError);
    });

    it('succeeds when confirming exactly the reserved days', async () => {
      const exactReserved = { ...mockBalance, reservedDays: 3 };
      const updatedBalance = { ...exactReserved, reservedDays: 0 };
      mockPrismaService.balance.findUnique.mockResolvedValue(exactReserved);
      mockPrismaService.balance.update.mockResolvedValue(updatedBalance);

      const result = await service.confirmDeduction('emp-1', 'loc-1', 3);

      expect(result).toEqual(updatedBalance);
    });
  });

  describe('restoreBalance', () => {
    it('increases available days, returning the updated balance', async () => {
      const updatedBalance = { ...mockBalance, availableDays: 23 };
      mockPrismaService.balance.findUnique.mockResolvedValue(mockBalance);
      mockPrismaService.balance.update.mockResolvedValue(updatedBalance);

      const result = await service.restoreBalance('emp-1', 'loc-1', 3);

      expect(result).toEqual(updatedBalance);
      expect(mockPrismaService.balance.update).toHaveBeenCalledWith({
        where: { employeeId_locationId: { employeeId: 'emp-1', locationId: 'loc-1' } },
        data: {
          availableDays: { increment: 3 },
        },
      });
    });

    it('throws NotFoundException when the balance does not exist', async () => {
      mockPrismaService.balance.findUnique.mockResolvedValue(null);

      await expect(service.restoreBalance('emp-1', 'loc-1', 3)).rejects.toThrow(NotFoundException);
    });
  });

  describe('setAvailableDays', () => {
    it('overwrites available days, returning the updated balance', async () => {
      const updatedBalance = { ...mockBalance, availableDays: 30 };
      mockPrismaService.balance.findUnique.mockResolvedValue(mockBalance);
      mockPrismaService.balance.update.mockResolvedValue(updatedBalance);

      const result = await service.setAvailableDays('emp-1', 'loc-1', 30);

      expect(result).toEqual(updatedBalance);
      expect(mockPrismaService.balance.update).toHaveBeenCalledWith({
        where: { employeeId_locationId: { employeeId: 'emp-1', locationId: 'loc-1' } },
        data: {
          availableDays: 30,
        },
      });
    });

    it('throws NotFoundException when the balance does not exist', async () => {
      mockPrismaService.balance.findUnique.mockResolvedValue(null);

      await expect(service.setAvailableDays('emp-1', 'loc-1', 30)).rejects.toThrow(NotFoundException);
    });
  });

  describe('upsertBalance', () => {
    it('creates a new balance when the pair does not exist, returning wasCreated true and previousAvailableDays 0', async () => {
      const createdBalance = { ...mockBalance, availableDays: 15 };
      mockPrismaService.balance.findUnique.mockResolvedValue(null);
      mockPrismaService.balance.create.mockResolvedValue(createdBalance);

      const result = await service.upsertBalance('emp-1', 'loc-1', 15);

      expect(result.wasCreated).toBe(true);
      expect(result.previousAvailableDays).toBe(0);
      expect(result.balance).toEqual(createdBalance);
      expect(mockPrismaService.balance.findUnique).toHaveBeenCalledWith({
        where: { employeeId_locationId: { employeeId: 'emp-1', locationId: 'loc-1' } },
      });
      expect(mockPrismaService.balance.create).toHaveBeenCalledWith({
        data: { employeeId: 'emp-1', locationId: 'loc-1', availableDays: 15 },
      });
    });

    it('updates an existing balance when the pair exists, returning wasCreated false and the prior availableDays', async () => {
      const updatedBalance = { ...mockBalance, availableDays: 30 };
      mockPrismaService.balance.findUnique.mockResolvedValue(mockBalance); // existing: availableDays 20
      mockPrismaService.balance.update.mockResolvedValue(updatedBalance);

      const result = await service.upsertBalance('emp-1', 'loc-1', 30);

      expect(result.wasCreated).toBe(false);
      expect(result.previousAvailableDays).toBe(20);
      expect(result.balance).toEqual(updatedBalance);
      expect(mockPrismaService.balance.findUnique).toHaveBeenCalledWith({
        where: { employeeId_locationId: { employeeId: 'emp-1', locationId: 'loc-1' } },
      });
      expect(mockPrismaService.balance.update).toHaveBeenCalledWith({
        where: { employeeId_locationId: { employeeId: 'emp-1', locationId: 'loc-1' } },
        data: { availableDays: 30 },
      });
    });
  });
});
