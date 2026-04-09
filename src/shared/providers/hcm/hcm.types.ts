import type { Either } from '@shared/core/either';

export type HcmErrorCode = 'INVALID_DIMENSIONS' | 'INSUFFICIENT_BALANCE' | 'NOT_FOUND' | 'UNKNOWN';

export type HcmError = {
  code: HcmErrorCode;
  message: string;
  statusCode: number;
};

export type HcmBalanceResponse = {
  employeeId: string;
  locationId: string;
  availableDays: number;
};

export type HcmSubmitRequest = {
  employeeId: string;
  locationId: string;
  startDate: string;
  endDate: string;
};

export type HcmSubmitResponse = {
  id: string;
  status: string;
};

export type GetBalanceResult = Either<HcmError, HcmBalanceResponse>;
export type SubmitTimeOffResult = Either<HcmError, HcmSubmitResponse>;
export type CancelTimeOffResult = Either<HcmError, void>;
