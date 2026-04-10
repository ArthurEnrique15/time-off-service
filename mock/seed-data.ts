export type MockBalance = {
  employeeId: string;
  locationId: string;
  availableDays: number;
};

export type MockRequest = {
  id: string;
  employeeId: string;
  locationId: string;
  startDate: string;
  endDate: string;
};

export const seedBalances: MockBalance[] = [
  { employeeId: 'emp-001', locationId: 'loc-us', availableDays: 20 },
  { employeeId: 'emp-001', locationId: 'loc-eu', availableDays: 25 },
  { employeeId: 'emp-002', locationId: 'loc-us', availableDays: 15 },
  { employeeId: 'emp-003', locationId: 'loc-us', availableDays: 10 },
  { employeeId: 'emp-003', locationId: 'loc-eu', availableDays: 30 },
  { employeeId: 'emp-004', locationId: 'loc-apac', availableDays: 18 },
];
