import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { ApproveRejectTimeOffRequestDto } from './approve-reject-time-off-request.dto';

describe('ApproveRejectTimeOffRequestDto', () => {
  it('passes validation with no body (empty object)', async () => {
    const dto = plainToInstance(ApproveRejectTimeOffRequestDto, {});
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('passes validation with a valid string actorId', async () => {
    const dto = plainToInstance(ApproveRejectTimeOffRequestDto, { actorId: 'mgr-123' });
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('fails validation when actorId is a number', async () => {
    const dto = plainToInstance(ApproveRejectTimeOffRequestDto, { actorId: 123 });
    const errors = await validate(dto);

    expect(errors.some((e) => e.property === 'actorId')).toBe(true);
  });
});
