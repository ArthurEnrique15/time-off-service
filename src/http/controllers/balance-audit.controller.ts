import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';

import { AUDIT_REASONS, BalanceAuditService, type PaginatedAuditHistory } from '@core/services/balance-audit.service';

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

    const parsedPage = page ? parseInt(page, 10) : undefined;
    const parsedLimit = limit ? parseInt(limit, 10) : undefined;

    return this.balanceAuditService.getHistory(employeeId, locationId, {
      page: Number.isFinite(parsedPage) ? parsedPage : 1,
      limit: Number.isFinite(parsedLimit) ? parsedLimit : 20,
      reason: reason as any,
    });
  }
}
