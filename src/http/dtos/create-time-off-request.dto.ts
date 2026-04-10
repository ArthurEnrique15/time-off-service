import { IsNotEmpty, IsString, Matches } from 'class-validator';

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export class CreateTimeOffRequestDto {
  @IsString()
  @IsNotEmpty()
  employeeId!: string;

  @IsString()
  @IsNotEmpty()
  locationId!: string;

  @Matches(DATE_ONLY_REGEX, { message: 'startDate must be a date in YYYY-MM-DD format' })
  startDate!: string;

  @Matches(DATE_ONLY_REGEX, { message: 'endDate must be a date in YYYY-MM-DD format' })
  endDate!: string;
}
