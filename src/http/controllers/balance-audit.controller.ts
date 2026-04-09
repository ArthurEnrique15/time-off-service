import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';

import {
  AUDIT_REASONS,
  BalanceAuditService,
  type PaginatedAuditHistory,
} from '@core/services/balance-audit.service';

@Controller('balances')
export class BalanceAuditController {
  constructor(private readonly balanceAuditService: BalanceAuditService) {}

  @Get(':employeeId/:locationId/history')
  async getHistory(
    @Param('employeeId') employeeId: string,
    @Param('locationId') locationId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('reason') reason?: string,
  ): Promise<PaginatedAuditHistory> {
    if (reason && !AUDIT_REASONS.includes(reason as any)) {
      throw new BadRequestException(`Invalid audit reason: ${reason}`);
    }

    return this.balanceAuditService.getHistory(employeeId, locationId, {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      reason,
    });
  }
}
