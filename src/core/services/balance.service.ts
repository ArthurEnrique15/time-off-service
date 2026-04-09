import { Injectable, NotFoundException } from '@nestjs/common';
import type { Balance } from '@prisma/client';

import { PrismaService } from '@app-prisma/prisma.service';

import { InsufficientBalanceError } from '@shared/errors/insufficient-balance.error';

@Injectable()
export class BalanceService {
  constructor(private readonly prismaService: PrismaService) {}

  async findByEmployeeAndLocation(employeeId: string, locationId: string): Promise<Balance | null> {
    return this.prismaService.balance.findUnique({
      where: { employeeId_locationId: { employeeId, locationId } },
    });
  }

  async findAllByEmployee(employeeId: string): Promise<Balance[]> {
    return this.prismaService.balance.findMany({
      where: { employeeId },
    });
  }

  async reserve(employeeId: string, locationId: string, days: number): Promise<Balance> {
    const balance = await this.findAndValidateExists(employeeId, locationId);

    if (balance.availableDays < days) {
      throw new InsufficientBalanceError(employeeId, locationId, days, balance.availableDays);
    }

    return this.prismaService.balance.update({
      where: { employeeId_locationId: { employeeId, locationId } },
      data: {
        availableDays: { decrement: days },
        reservedDays: { increment: days },
      },
    });
  }

  async releaseReservation(employeeId: string, locationId: string, days: number): Promise<Balance> {
    const balance = await this.findAndValidateExists(employeeId, locationId);

    if (balance.reservedDays < days) {
      throw new InsufficientBalanceError(employeeId, locationId, days, balance.reservedDays);
    }

    return this.prismaService.balance.update({
      where: { employeeId_locationId: { employeeId, locationId } },
      data: {
        reservedDays: { decrement: days },
        availableDays: { increment: days },
      },
    });
  }

  async confirmDeduction(employeeId: string, locationId: string, days: number): Promise<Balance> {
    const balance = await this.findAndValidateExists(employeeId, locationId);

    if (balance.reservedDays < days) {
      throw new InsufficientBalanceError(employeeId, locationId, days, balance.reservedDays);
    }

    return this.prismaService.balance.update({
      where: { employeeId_locationId: { employeeId, locationId } },
      data: {
        reservedDays: { decrement: days },
      },
    });
  }

  async restoreBalance(employeeId: string, locationId: string, days: number): Promise<Balance> {
    await this.findAndValidateExists(employeeId, locationId);

    return this.prismaService.balance.update({
      where: { employeeId_locationId: { employeeId, locationId } },
      data: {
        availableDays: { increment: days },
      },
    });
  }

  async setAvailableDays(employeeId: string, locationId: string, newAvailable: number): Promise<Balance> {
    await this.findAndValidateExists(employeeId, locationId);

    return this.prismaService.balance.update({
      where: { employeeId_locationId: { employeeId, locationId } },
      data: {
        availableDays: newAvailable,
      },
    });
  }

  private async findAndValidateExists(employeeId: string, locationId: string): Promise<Balance> {
    const balance = await this.findByEmployeeAndLocation(employeeId, locationId);

    if (!balance) {
      throw new NotFoundException(`Balance not found for employee ${employeeId} at location ${locationId}`);
    }

    return balance;
  }
}
