import { Injectable } from '@nestjs/common';
import type { TimeOffRequest } from '@prisma/client';

import { PrismaService } from '@app-prisma/prisma.service';

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
  constructor(private readonly prismaService: PrismaService) {}

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
}
