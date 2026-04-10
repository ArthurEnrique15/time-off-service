import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { TimeOffRequest } from '@prisma/client';
import { differenceInCalendarDays, isAfter, parseISO } from 'date-fns';

import { PrismaService } from '@app-prisma/prisma.service';
import { BalanceAuditService } from '@core/services/balance-audit.service';
import { BalanceService } from '@core/services/balance.service';
import { InsufficientBalanceError } from '@shared/errors/insufficient-balance.error';
import { HcmClient } from '@shared/providers/hcm/hcm.client';
import type { HcmError } from '@shared/providers/hcm/hcm.types';

import type { CreateTimeOffRequestDto } from '@http/dtos/create-time-off-request.dto';

@Injectable()
export class TimeOffRequestService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly balanceService: BalanceService,
    private readonly balanceAuditService: BalanceAuditService,
    private readonly hcmClient: HcmClient,
  ) {}

  async create(dto: CreateTimeOffRequestDto): Promise<TimeOffRequest> {
    const { employeeId, locationId, startDate, endDate } = dto;

    if (isAfter(parseISO(startDate), parseISO(endDate))) {
      throw new BadRequestException('startDate must be before or equal to endDate');
    }

    const daysRequested = differenceInCalendarDays(parseISO(endDate), parseISO(startDate)) + 1;

    const balance = await this.balanceService.findByEmployeeAndLocation(employeeId, locationId);

    if (!balance) {
      throw new NotFoundException(
        `Balance not found for employee ${employeeId} at location ${locationId}`,
      );
    }

    if (balance.availableDays < daysRequested) {
      throw new InsufficientBalanceError(employeeId, locationId, daysRequested, balance.availableDays);
    }

    let hcmRequestId: string | undefined;

    try {
      const hcmResult = await this.hcmClient.submitTimeOff({ employeeId, locationId, startDate, endDate });

      if (hcmResult.isFailure()) {
        this.throwHcmError(hcmResult.value);
      }

      hcmRequestId = hcmResult.value.id;

      return await this.prismaService.$transaction(async (tx) => {
        await this.balanceService.reserveInTx(tx, employeeId, locationId, daysRequested);

        const request = await tx.timeOffRequest.create({
          data: {
            employeeId,
            locationId,
            startDate: parseISO(startDate),
            endDate: parseISO(endDate),
            status: 'PENDING',
            hcmRequestId,
          },
        });

        await this.balanceAuditService.recordEntryInTx(tx, {
          balanceId: balance.id,
          delta: -daysRequested,
          reason: 'RESERVATION',
          requestId: request.id,
        });

        return request;
      });
    } catch (err) {
      if (hcmRequestId) {
        await this.hcmClient.cancelTimeOff(hcmRequestId).catch(() => {});
      }
      throw err;
    }
  }

  private throwHcmError(error: HcmError): never {
    switch (error.code) {
      case 'INSUFFICIENT_BALANCE':
        throw new BadRequestException(error.message);
      case 'INVALID_DIMENSIONS':
        throw new UnprocessableEntityException(error.message);
      default:
        throw new ServiceUnavailableException('HCM service is unavailable');
    }
  }
}
