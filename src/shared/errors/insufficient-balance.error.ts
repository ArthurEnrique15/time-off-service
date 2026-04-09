import { BadRequestException } from '@nestjs/common';

export class InsufficientBalanceError extends BadRequestException {
  constructor(employeeId: string, locationId: string, requested: number, available: number) {
    super(
      `Insufficient balance for employee ${employeeId} at location ${locationId}: ` +
        `requested ${requested}, available ${available}`,
    );
  }
}
