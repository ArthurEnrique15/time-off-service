import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { BalanceService } from '@core/services/balance.service';

import { BalanceController } from '@http/controllers/balance.controller';

describe('BalanceController', () => {
  let controller: BalanceController;

  const mockBalance = {
    id: 'balance-1',
    employeeId: 'emp-1',
    locationId: 'loc-1',
    availableDays: 20,
    reservedDays: 5,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockBalanceService = {
    findAllByEmployee: jest.fn(),
    findByEmployeeAndLocation: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BalanceController],
      providers: [{ provide: BalanceService, useValue: mockBalanceService }],
    }).compile();

    controller = module.get<BalanceController>(BalanceController);
  });

  describe('findAll', () => {
    it('delegates to balanceService.findAllByEmployee and returns the result', async () => {
      const balances = [mockBalance];
      mockBalanceService.findAllByEmployee.mockResolvedValue(balances);

      await expect(controller.findAll('emp-1')).resolves.toEqual(balances);
      expect(mockBalanceService.findAllByEmployee).toHaveBeenCalledWith('emp-1');
    });

    it('returns an empty array when the employee has no balances', async () => {
      mockBalanceService.findAllByEmployee.mockResolvedValue([]);

      await expect(controller.findAll('emp-1')).resolves.toEqual([]);
    });

    it('throws BadRequestException when employeeId is not provided', () => {
      expect(() => controller.findAll(undefined as unknown as string)).toThrow(BadRequestException);
      expect(mockBalanceService.findAllByEmployee).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('delegates to balanceService.findByEmployeeAndLocation and returns the balance', async () => {
      mockBalanceService.findByEmployeeAndLocation.mockResolvedValue(mockBalance);

      await expect(controller.findOne('emp-1', 'loc-1')).resolves.toEqual(mockBalance);
      expect(mockBalanceService.findByEmployeeAndLocation).toHaveBeenCalledWith('emp-1', 'loc-1');
    });

    it('throws NotFoundException when the balance does not exist', async () => {
      mockBalanceService.findByEmployeeAndLocation.mockResolvedValue(null);

      await expect(controller.findOne('emp-1', 'loc-1')).rejects.toThrow(NotFoundException);
    });
  });
});
