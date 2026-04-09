import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import type { TimeOffRequest } from '@prisma/client';

import { TimeOffRequestService } from '@core/services/time-off-request.service';
import { CreateTimeOffRequestDto } from '@http/dtos/create-time-off-request.dto';

@Controller('time-off-requests')
export class TimeOffRequestController {
  constructor(private readonly timeOffRequestService: TimeOffRequestService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateTimeOffRequestDto): Promise<TimeOffRequest> {
    return this.timeOffRequestService.create(dto);
  }
}
