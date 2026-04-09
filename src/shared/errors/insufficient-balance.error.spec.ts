import { BadRequestException } from '@nestjs/common';

import { InsufficientBalanceError } from './insufficient-balance.error';

describe('InsufficientBalanceError', () => {
  it('extends BadRequestException', () => {
    const error = new InsufficientBalanceError('emp-1', 'loc-1', 5, 3);

    expect(error).toBeInstanceOf(BadRequestException);
  });

  it('includes employee, location, requested, and available in the message', () => {
    const error = new InsufficientBalanceError('emp-1', 'loc-1', 5, 3);

    expect(error.message).toContain('emp-1');
    expect(error.message).toContain('loc-1');
    expect(error.message).toContain('5');
    expect(error.message).toContain('3');
  });
});
