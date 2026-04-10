import { Injectable, NotFoundException } from '@nestjs/common';
import type { Balance } from '@prisma/client';

import { PrismaService } from '@app-prisma/prisma.service';

import { InsufficientBalanceError } from '@shared/errors/insufficient-balance.error';

type TxClient = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

export type UpsertBalanceResult = {
  balance: Balance;
  previousAvailableDays: number;
  wasCreated: boolean;
};

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
    return this.prismaService.$transaction(async (tx) => {
      const balance = await this.findAndValidateExists(tx, employeeId, locationId);

      if (balance.availableDays < days) {
        throw new InsufficientBalanceError(employeeId, locationId, days, balance.availableDays);
      }

      return tx.balance.update({
        where: { employeeId_locationId: { employeeId, locationId } },
        data: {
          availableDays: { decrement: days },
          reservedDays: { increment: days },
        },
      });
    });
  }

  async releaseReservation(employeeId: string, locationId: string, days: number): Promise<Balance> {
    return this.prismaService.$transaction(async (tx) => {
      const balance = await this.findAndValidateExists(tx, employeeId, locationId);

      if (balance.reservedDays < days) {
        throw new InsufficientBalanceError(employeeId, locationId, days, balance.reservedDays);
      }

      return tx.balance.update({
        where: { employeeId_locationId: { employeeId, locationId } },
        data: {
          reservedDays: { decrement: days },
          availableDays: { increment: days },
        },
      });
    });
  }

  async confirmDeduction(employeeId: string, locationId: string, days: number): Promise<Balance> {
    return this.prismaService.$transaction(async (tx) => {
      const balance = await this.findAndValidateExists(tx, employeeId, locationId);

      if (balance.reservedDays < days) {
        throw new InsufficientBalanceError(employeeId, locationId, days, balance.reservedDays);
      }

      return tx.balance.update({
        where: { employeeId_locationId: { employeeId, locationId } },
        data: {
          reservedDays: { decrement: days },
        },
      });
    });
  }

  async restoreBalance(employeeId: string, locationId: string, days: number): Promise<Balance> {
    return this.prismaService.$transaction(async (tx) => {
      await this.findAndValidateExists(tx, employeeId, locationId);

      return tx.balance.update({
        where: { employeeId_locationId: { employeeId, locationId } },
        data: {
          availableDays: { increment: days },
        },
      });
    });
  }

  async setAvailableDays(employeeId: string, locationId: string, newAvailable: number): Promise<Balance> {
    return this.prismaService.$transaction(async (tx) => {
      await this.findAndValidateExists(tx, employeeId, locationId);

      return tx.balance.update({
        where: { employeeId_locationId: { employeeId, locationId } },
        data: {
          availableDays: newAvailable,
        },
      });
    });
  }

  async upsertBalance(employeeId: string, locationId: string, availableDays: number): Promise<UpsertBalanceResult> {
    return this.prismaService.$transaction(async (tx) => {
      const existing = await tx.balance.findUnique({
        where: { employeeId_locationId: { employeeId, locationId } },
      });

      if (existing) {
        const balance = await tx.balance.update({
          where: { employeeId_locationId: { employeeId, locationId } },
          data: { availableDays },
        });

        return { balance, previousAvailableDays: existing.availableDays, wasCreated: false };
      }

      const balance = await tx.balance.create({
        data: { employeeId, locationId, availableDays },
      });

      return { balance, previousAvailableDays: 0, wasCreated: true };
    });
  }

  private async findAndValidateExists(tx: TxClient, employeeId: string, locationId: string): Promise<Balance> {
    const balance = await tx.balance.findUnique({
      where: { employeeId_locationId: { employeeId, locationId } },
    });

    if (!balance) {
      throw new NotFoundException(`Balance not found for employee ${employeeId} at location ${locationId}`);
    }

    return balance;
  }
}
