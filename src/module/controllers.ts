import { BalanceAuditController } from '@http/controllers/balance-audit.controller';
import { BalanceController } from '@http/controllers/balance.controller';
import { HealthController } from '@http/controllers/health.controller';
import { TimeOffRequestController } from '@http/controllers/time-off-request.controller';

export const timeOffModuleControllers = [
  BalanceController,
  HealthController,
  BalanceAuditController,
  TimeOffRequestController,
];
