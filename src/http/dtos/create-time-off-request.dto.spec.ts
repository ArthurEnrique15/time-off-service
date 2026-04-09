import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

import { CreateTimeOffRequestDto } from './create-time-off-request.dto';

const validPayload = {
  employeeId: 'emp-1',
  locationId: 'loc-1',
  startDate: '2025-06-01',
  endDate: '2025-06-05',
};

describe('CreateTimeOffRequestDto', () => {
  it('passes validation with a complete valid payload', async () => {
    const dto = plainToInstance(CreateTimeOffRequestDto, validPayload);
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('fails when employeeId is missing', async () => {
    const dto = plainToInstance(CreateTimeOffRequestDto, { ...validPayload, employeeId: undefined });
    const errors = await validate(dto);

    expect(errors.some((e) => e.property === 'employeeId')).toBe(true);
  });

  it('fails when locationId is missing', async () => {
    const dto = plainToInstance(CreateTimeOffRequestDto, { ...validPayload, locationId: undefined });
    const errors = await validate(dto);

    expect(errors.some((e) => e.property === 'locationId')).toBe(true);
  });

  it('fails when startDate is missing', async () => {
    const dto = plainToInstance(CreateTimeOffRequestDto, { ...validPayload, startDate: undefined });
    const errors = await validate(dto);

    expect(errors.some((e) => e.property === 'startDate')).toBe(true);
  });

  it('fails when endDate is missing', async () => {
    const dto = plainToInstance(CreateTimeOffRequestDto, { ...validPayload, endDate: undefined });
    const errors = await validate(dto);

    expect(errors.some((e) => e.property === 'endDate')).toBe(true);
  });

  it('fails when startDate is not a valid ISO 8601 date string', async () => {
    const dto = plainToInstance(CreateTimeOffRequestDto, { ...validPayload, startDate: 'not-a-date' });
    const errors = await validate(dto);

    expect(errors.some((e) => e.property === 'startDate')).toBe(true);
  });

  it('fails when endDate is not a valid ISO 8601 date string', async () => {
    const dto = plainToInstance(CreateTimeOffRequestDto, { ...validPayload, endDate: 'not-a-date' });
    const errors = await validate(dto);

    expect(errors.some((e) => e.property === 'endDate')).toBe(true);
  });
});
