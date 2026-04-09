import { BadRequestException, Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import type { TimeOffRequest } from '@prisma/client';

import {
  TIME_OFF_REQUEST_STATUSES,
  TimeOffRequestService,
  type PaginatedRequestList,
  type TimeOffRequestStatus,
} from '@core/services/time-off-request.service';

@Controller('time-off-requests')
export class TimeOffRequestController {
  constructor(private readonly timeOffRequestService: TimeOffRequestService) {}

  @Get()
  async findAll(
    @Query('employeeId') employeeId: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<PaginatedRequestList> {
    if (!employeeId) {
      throw new BadRequestException('employeeId query parameter is required');
    }

    if (status && !TIME_OFF_REQUEST_STATUSES.includes(status as TimeOffRequestStatus)) {
      throw new BadRequestException(`Invalid status: ${status}. Must be one of ${TIME_OFF_REQUEST_STATUSES.join(', ')}`);
    }

    const parsedPage = page ? parseInt(page, 10) : undefined;
    const parsedLimit = limit ? parseInt(limit, 10) : undefined;

    return this.timeOffRequestService.findAllByEmployee(employeeId, {
      page: Number.isFinite(parsedPage) ? parsedPage : 1,
      limit: Number.isFinite(parsedLimit) ? parsedLimit : 20,
      status: status as TimeOffRequestStatus | undefined,
    });
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<TimeOffRequest> {
    const request = await this.timeOffRequestService.findById(id);

    if (!request) {
      throw new NotFoundException(`Time-off request ${id} not found`);
    }

    return request;
  }
}
