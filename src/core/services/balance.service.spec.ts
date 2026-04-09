import { NotFoundException } from '@nestjs/common';

import type { PrismaService } from '@app-prisma/prisma.service';

import { BalanceService } from '@core/services/balance.service';

import { InsufficientBalanceError } from '@shared/errors/insufficient-balance.error';

describe('BalanceService', () => {
  const mockBalance = {
    id: 'balance-1',
    employeeId: 'emp-1',
    locationId: 'loc-1',
    availableDays: 20,
    reservedDays: 5,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const createService = (overrides?: {
    findUnique?: jest.Mock;
    findMany?: jest.Mock;
    update?: jest.Mock;
  }): BalanceService => {
    const prismaService = {
      balance: {
        findUnique: overrides?.findUnique ?? jest.fn(),
        findMany: overrides?.findMany ?? jest.fn(),
        update: overrides?.update ?? jest.fn(),
      },
    } as unknown as PrismaService;

    return new BalanceService(prismaService);
  };

  describe('findByEmployeeAndLocation', () => {
    it('returns the balance when found', async () => {
      const findUnique = jest.fn().mockResolvedValue(mockBalance);
      const service = createService({ findUnique });

      const result = await service.findByEmployeeAndLocation('emp-1', 'loc-1');

      expect(result).toEqual(mockBalance);
      expect(findUnique).toHaveBeenCalledWith({
        where: { employeeId_locationId: { employeeId: 'emp-1', locationId: 'loc-1' } },
      });
    });

    it('returns null when the balance does not exist', async () => {
      const findUnique = jest.fn().mockResolvedValue(null);
      const service = createService({ findUnique });

      const result = await service.findByEmployeeAndLocation('emp-1', 'loc-1');

      expect(result).toBeNull();
    });
  });

  describe('findAllByEmployee', () => {
    it('returns an array of balances for the employee', async () => {
      const balances = [mockBalance, { ...mockBalance, id: 'balance-2', locationId: 'loc-2' }];
      const findMany = jest.fn().mockResolvedValue(balances);
      const service = createService({ findMany });

      const result = await service.findAllByEmployee('emp-1');

      expect(result).toEqual(balances);
      expect(findMany).toHaveBeenCalledWith({
        where: { employeeId: 'emp-1' },
      });
    });

    it('returns an empty array when no balances exist', async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const service = createService({ findMany });

      const result = await service.findAllByEmployee('emp-1');

      expect(result).toEqual([]);
    });
  });

  describe('reserve', () => {
    it('decreases available and increases reserved, returning the updated balance', async () => {
      const updatedBalance = { ...mockBalance, availableDays: 17, reservedDays: 8 };
      const findUnique = jest.fn().mockResolvedValue(mockBalance);
      const update = jest.fn().mockResolvedValue(updatedBalance);
      const service = createService({ findUnique, update });

      const result = await service.reserve('emp-1', 'loc-1', 3);

      expect(result).toEqual(updatedBalance);
      expect(update).toHaveBeenCalledWith({
        where: { employeeId_locationId: { employeeId: 'emp-1', locationId: 'loc-1' } },
        data: {
          availableDays: { decrement: 3 },
          reservedDays: { increment: 3 },
        },
      });
    });

    it('throws NotFoundException when the balance does not exist', async () => {
      const findUnique = jest.fn().mockResolvedValue(null);
      const service = createService({ findUnique });

      await expect(service.reserve('emp-1', 'loc-1', 3)).rejects.toThrow(
        'Balance not found for employee emp-1 at location loc-1',
      );
    });

    it('throws InsufficientBalanceError when available days are insufficient', async () => {
      const lowBalance = { ...mockBalance, availableDays: 2 };
      const findUnique = jest.fn().mockResolvedValue(lowBalance);
      const service = createService({ findUnique });

      await expect(service.reserve('emp-1', 'loc-1', 5)).rejects.toThrow(InsufficientBalanceError);
    });

    it('succeeds when requesting exactly the available days', async () => {
      const exactBalance = { ...mockBalance, availableDays: 5, reservedDays: 0 };
      const updatedBalance = { ...exactBalance, availableDays: 0, reservedDays: 5 };
      const findUnique = jest.fn().mockResolvedValue(exactBalance);
      const update = jest.fn().mockResolvedValue(updatedBalance);
      const service = createService({ findUnique, update });

      const result = await service.reserve('emp-1', 'loc-1', 5);

      expect(result).toEqual(updatedBalance);
    });
  });

  describe('releaseReservation', () => {
    it('decreases reserved and increases available, returning the updated balance', async () => {
      const updatedBalance = { ...mockBalance, availableDays: 23, reservedDays: 2 };
      const findUnique = jest.fn().mockResolvedValue(mockBalance);
      const update = jest.fn().mockResolvedValue(updatedBalance);
      const service = createService({ findUnique, update });

      const result = await service.releaseReservation('emp-1', 'loc-1', 3);

      expect(result).toEqual(updatedBalance);
      expect(update).toHaveBeenCalledWith({
        where: { employeeId_locationId: { employeeId: 'emp-1', locationId: 'loc-1' } },
        data: {
          reservedDays: { decrement: 3 },
          availableDays: { increment: 3 },
        },
      });
    });

    it('throws NotFoundException when the balance does not exist', async () => {
      const findUnique = jest.fn().mockResolvedValue(null);
      const service = createService({ findUnique });

      await expect(service.releaseReservation('emp-1', 'loc-1', 3)).rejects.toThrow(NotFoundException);
    });

    it('throws InsufficientBalanceError when reserved days are insufficient', async () => {
      const lowReserved = { ...mockBalance, reservedDays: 1 };
      const findUnique = jest.fn().mockResolvedValue(lowReserved);
      const service = createService({ findUnique });

      await expect(service.releaseReservation('emp-1', 'loc-1', 5)).rejects.toThrow(InsufficientBalanceError);
    });

    it('succeeds when releasing exactly the reserved days', async () => {
      const exactReserved = { ...mockBalance, reservedDays: 3, availableDays: 10 };
      const updatedBalance = { ...exactReserved, reservedDays: 0, availableDays: 13 };
      const findUnique = jest.fn().mockResolvedValue(exactReserved);
      const update = jest.fn().mockResolvedValue(updatedBalance);
      const service = createService({ findUnique, update });

      const result = await service.releaseReservation('emp-1', 'loc-1', 3);

      expect(result).toEqual(updatedBalance);
    });
    it('decreases reserved days permanently, returning the updated balance', async () => {
      const updatedBalance = { ...mockBalance, reservedDays: 2 };
      const findUnique = jest.fn().mockResolvedValue(mockBalance);
      const update = jest.fn().mockResolvedValue(updatedBalance);
      const service = createService({ findUnique, update });

      const result = await service.confirmDeduction('emp-1', 'loc-1', 3);

      expect(result).toEqual(updatedBalance);
      expect(update).toHaveBeenCalledWith({
        where: { employeeId_locationId: { employeeId: 'emp-1', locationId: 'loc-1' } },
        data: {
          reservedDays: { decrement: 3 },
        },
      });
    });

    it('throws NotFoundException when the balance does not exist', async () => {
      const findUnique = jest.fn().mockResolvedValue(null);
      const service = createService({ findUnique });

      await expect(service.confirmDeduction('emp-1', 'loc-1', 3)).rejects.toThrow(NotFoundException);
    });

    it('throws InsufficientBalanceError when reserved days are insufficient', async () => {
      const lowReserved = { ...mockBalance, reservedDays: 1 };
      const findUnique = jest.fn().mockResolvedValue(lowReserved);
      const service = createService({ findUnique });

      await expect(service.confirmDeduction('emp-1', 'loc-1', 5)).rejects.toThrow(InsufficientBalanceError);
    });

    it('succeeds when confirming exactly the reserved days', async () => {
      const exactReserved = { ...mockBalance, reservedDays: 3 };
      const updatedBalance = { ...exactReserved, reservedDays: 0 };
      const findUnique = jest.fn().mockResolvedValue(exactReserved);
      const update = jest.fn().mockResolvedValue(updatedBalance);
      const service = createService({ findUnique, update });

      const result = await service.confirmDeduction('emp-1', 'loc-1', 3);

      expect(result).toEqual(updatedBalance);
    });
  });

  describe('restoreBalance', () => {
    it('increases available days, returning the updated balance', async () => {
      const updatedBalance = { ...mockBalance, availableDays: 23 };
      const findUnique = jest.fn().mockResolvedValue(mockBalance);
      const update = jest.fn().mockResolvedValue(updatedBalance);
      const service = createService({ findUnique, update });

      const result = await service.restoreBalance('emp-1', 'loc-1', 3);

      expect(result).toEqual(updatedBalance);
      expect(update).toHaveBeenCalledWith({
        where: { employeeId_locationId: { employeeId: 'emp-1', locationId: 'loc-1' } },
        data: {
          availableDays: { increment: 3 },
        },
      });
    });

    it('throws NotFoundException when the balance does not exist', async () => {
      const findUnique = jest.fn().mockResolvedValue(null);
      const service = createService({ findUnique });

      await expect(service.restoreBalance('emp-1', 'loc-1', 3)).rejects.toThrow(NotFoundException);
    });
  });

  describe('setAvailableDays', () => {
    it('overwrites available days, returning the updated balance', async () => {
      const updatedBalance = { ...mockBalance, availableDays: 30 };
      const findUnique = jest.fn().mockResolvedValue(mockBalance);
      const update = jest.fn().mockResolvedValue(updatedBalance);
      const service = createService({ findUnique, update });

      const result = await service.setAvailableDays('emp-1', 'loc-1', 30);

      expect(result).toEqual(updatedBalance);
      expect(update).toHaveBeenCalledWith({
        where: { employeeId_locationId: { employeeId: 'emp-1', locationId: 'loc-1' } },
        data: {
          availableDays: 30,
        },
      });
    });

    it('throws NotFoundException when the balance does not exist', async () => {
      const findUnique = jest.fn().mockResolvedValue(null);
      const service = createService({ findUnique });

      await expect(service.setAvailableDays('emp-1', 'loc-1', 30)).rejects.toThrow(NotFoundException);
    });
  });
});
