import {
  BadRequestException,
  ConflictException,
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

import type { CreateTimeOffRequestDto } from '@http/dtos/create-time-off-request.dto';

import { InsufficientBalanceError } from '@shared/errors/insufficient-balance.error';
import { HcmClient } from '@shared/providers/hcm/hcm.client';
import type { HcmError } from '@shared/providers/hcm/hcm.types';

export const TIME_OFF_REQUEST_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;

export type TimeOffRequestStatus = (typeof TIME_OFF_REQUEST_STATUSES)[number];

export type PaginatedRequestList = {
  data: TimeOffRequest[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

const MAX_LIMIT = 100;

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
      throw new NotFoundException(`Balance not found for employee ${employeeId} at location ${locationId}`);
    }

    if (balance.availableDays < daysRequested) {
      throw new InsufficientBalanceError(employeeId, locationId, daysRequested, balance.availableDays);
    }

    return this.prismaService.$transaction(async (tx) => {
      await this.balanceService.reserveInTx(tx, employeeId, locationId, daysRequested);

      const request = await tx.timeOffRequest.create({
        data: {
          employeeId,
          locationId,
          startDate: parseISO(startDate),
          endDate: parseISO(endDate),
          status: 'PENDING',
          hcmRequestId: null,
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
  }

  async findById(id: string): Promise<TimeOffRequest | null> {
    return this.prismaService.timeOffRequest.findUnique({ where: { id } });
  }

  async findAllByEmployee(
    employeeId: string,
    options: { page: number; limit: number; status?: TimeOffRequestStatus },
  ): Promise<PaginatedRequestList> {
    const page = Math.max(options.page, 1);
    const limit = Math.min(Math.max(options.limit, 1), MAX_LIMIT);
    const skip = (page - 1) * limit;

    const where: { employeeId: string; status?: TimeOffRequestStatus } = { employeeId };

    if (options.status) {
      where.status = options.status;
    }

    const [data, total] = await Promise.all([
      this.prismaService.timeOffRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prismaService.timeOffRequest.count({ where }),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  }

  async approve(id: string, actorId?: string): Promise<TimeOffRequest> {
    const request = await this.findById(id);

    if (!request) {
      throw new NotFoundException(`Time-off request ${id} not found`);
    }

    if (request.status !== 'PENDING') {
      throw new ConflictException(`Cannot approve a ${request.status} request`);
    }

    const daysRequested = differenceInCalendarDays(request.endDate, request.startDate) + 1;
    const balance = await this.balanceService.findByEmployeeAndLocation(request.employeeId, request.locationId);

    if (!balance) {
      throw new NotFoundException(
        `Balance not found for employee ${request.employeeId} at location ${request.locationId}`,
      );
    }

    const hcmResult = await this.hcmClient.submitTimeOff({
      employeeId: request.employeeId,
      locationId: request.locationId,
      startDate: this.toHcmDate(request.startDate),
      endDate: this.toHcmDate(request.endDate),
    });

    if (hcmResult.isFailure()) {
      if (hcmResult.value.code === 'UNKNOWN') {
        await this.balanceAuditService.recordEntry({
          balanceId: balance.id,
          delta: 0,
          reason: 'HCM_SYNC',
          requestId: id,
          actorId,
          reference: this.buildHcmSyncFailureReference(hcmResult.value.code),
        });
        this.throwHcmError(hcmResult.value);
      }

      await this.prismaService.$transaction(async (tx) => {
        await tx.timeOffRequest.update({ where: { id }, data: { status: 'REJECTED', hcmRequestId: null } });
        const releasedBalance = await this.balanceService.releaseReservationInTx(
          tx,
          request.employeeId,
          request.locationId,
          daysRequested,
        );
        await this.balanceAuditService.recordEntryInTx(tx, {
          balanceId: releasedBalance.id,
          delta: daysRequested,
          reason: 'RESERVATION_RELEASE',
          requestId: id,
          actorId,
        });
        await this.balanceAuditService.recordEntryInTx(tx, {
          balanceId: releasedBalance.id,
          delta: 0,
          reason: 'HCM_SYNC',
          requestId: id,
          actorId,
          reference: this.buildHcmSyncFailureReference(hcmResult.value.code),
        });
      });

      this.throwHcmError(hcmResult.value);
    }

    return this.prismaService.$transaction(async (tx) => {
      const updatedRequest = await tx.timeOffRequest.update({
        where: { id },
        data: { status: 'APPROVED', hcmRequestId: hcmResult.value.id },
      });
      const confirmedBalance = await this.balanceService.confirmDeductionInTx(
        tx,
        request.employeeId,
        request.locationId,
        daysRequested,
      );
      await this.balanceAuditService.recordEntryInTx(tx, {
        balanceId: confirmedBalance.id,
        delta: -daysRequested,
        reason: 'APPROVAL_DEDUCTION',
        requestId: id,
        actorId,
      });
      await this.balanceAuditService.recordEntryInTx(tx, {
        balanceId: confirmedBalance.id,
        delta: 0,
        reason: 'HCM_SYNC',
        requestId: id,
        actorId,
        reference: this.buildHcmSyncSuccessReference(hcmResult.value.id),
      });
      return updatedRequest;
    });
  }

  async reject(id: string, actorId?: string): Promise<TimeOffRequest> {
    const request = await this.findById(id);

    if (!request) {
      throw new NotFoundException(`Time-off request ${id} not found`);
    }

    if (request.status !== 'PENDING') {
      throw new ConflictException(`Cannot reject a ${request.status} request`);
    }

    const daysRequested = differenceInCalendarDays(request.endDate, request.startDate) + 1;

    return this.prismaService.$transaction(async (tx) => {
      const updatedRequest = await tx.timeOffRequest.update({ where: { id }, data: { status: 'REJECTED' } });
      const balance = await this.balanceService.releaseReservationInTx(
        tx,
        request.employeeId,
        request.locationId,
        daysRequested,
      );
      await this.balanceAuditService.recordEntryInTx(tx, {
        balanceId: balance.id,
        delta: daysRequested,
        reason: 'RESERVATION_RELEASE',
        requestId: id,
        actorId,
      });
      return updatedRequest;
    });
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

  private buildHcmSyncSuccessReference(hcmRequestId: string): string {
    return `operation=approve outcome=success hcmRequestId=${hcmRequestId}`;
  }

  private buildHcmSyncFailureReference(code: HcmError['code']): string {
    return `operation=approve outcome=failure code=${code}`;
  }

  private toHcmDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
