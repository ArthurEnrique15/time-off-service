import { PrismaClient } from '@prisma/client';

describe('Prisma domain model delegates', () => {
  it('exposes a balance model delegate', () => {
    const client = new PrismaClient();

    expect(client.balance).toBeDefined();
    expect(typeof client.balance.findMany).toBe('function');
    expect(typeof client.balance.create).toBe('function');
  });

  it('exposes a timeOffRequest model delegate', () => {
    const client = new PrismaClient();

    expect(client.timeOffRequest).toBeDefined();
    expect(typeof client.timeOffRequest.findMany).toBe('function');
    expect(typeof client.timeOffRequest.create).toBe('function');
  });

  it('exposes a balanceAuditEntry model delegate', () => {
    const client = new PrismaClient();

    expect(client.balanceAuditEntry).toBeDefined();
    expect(typeof client.balanceAuditEntry.findMany).toBe('function');
    expect(typeof client.balanceAuditEntry.create).toBe('function');
  });
});
