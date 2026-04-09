import { BadRequestException, Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import type { Balance } from '@prisma/client';

import { BalanceService } from '@core/services/balance.service';

@Controller('balances')
export class BalanceController {
  constructor(private readonly balanceService: BalanceService) {}

  @Get()
  findAll(@Query('employeeId') employeeId: string): Promise<Balance[]> {
    if (!employeeId) {
      throw new BadRequestException('employeeId query parameter is required');
    }

    return this.balanceService.findAllByEmployee(employeeId);
  }

  @Get(':employeeId/:locationId')
  async findOne(@Param('employeeId') employeeId: string, @Param('locationId') locationId: string): Promise<Balance> {
    const balance = await this.balanceService.findByEmployeeAndLocation(employeeId, locationId);

    if (!balance) {
      throw new NotFoundException(`Balance not found for employee ${employeeId} at location ${locationId}`);
    }

    return balance;
  }
}
