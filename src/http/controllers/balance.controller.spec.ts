import { NotFoundException } from '@nestjs/common';

import type { BalanceService } from '@core/services/balance.service';

import { BalanceController } from '@http/controllers/balance.controller';

describe('BalanceController', () => {
  const mockBalance = {
    id: 'balance-1',
    employeeId: 'emp-1',
    locationId: 'loc-1',
    availableDays: 20,
    reservedDays: 5,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  describe('findAll', () => {
    it('delegates to balanceService.findAllByEmployee and returns the result', async () => {
      const balances = [mockBalance];
      const balanceService = {
        findAllByEmployee: jest.fn().mockResolvedValue(balances),
      } as unknown as BalanceService;

      const controller = new BalanceController(balanceService);

      await expect(controller.findAll('emp-1')).resolves.toEqual(balances);
      expect(balanceService.findAllByEmployee).toHaveBeenCalledWith('emp-1');
    });

    it('returns an empty array when the employee has no balances', async () => {
      const balanceService = {
        findAllByEmployee: jest.fn().mockResolvedValue([]),
      } as unknown as BalanceService;

      const controller = new BalanceController(balanceService);

      await expect(controller.findAll('emp-1')).resolves.toEqual([]);
    });
  });

  describe('findOne', () => {
    it('delegates to balanceService.findByEmployeeAndLocation and returns the balance', async () => {
      const balanceService = {
        findByEmployeeAndLocation: jest.fn().mockResolvedValue(mockBalance),
      } as unknown as BalanceService;

      const controller = new BalanceController(balanceService);

      await expect(controller.findOne('emp-1', 'loc-1')).resolves.toEqual(mockBalance);
      expect(balanceService.findByEmployeeAndLocation).toHaveBeenCalledWith('emp-1', 'loc-1');
    });

    it('throws NotFoundException when the balance does not exist', async () => {
      const balanceService = {
        findByEmployeeAndLocation: jest.fn().mockResolvedValue(null),
      } as unknown as BalanceService;

      const controller = new BalanceController(balanceService);

      await expect(controller.findOne('emp-1', 'loc-1')).rejects.toThrow(NotFoundException);
    });
  });
});
