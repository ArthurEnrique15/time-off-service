import { BalanceAuditController } from '@http/controllers/balance-audit.controller';
import { BalanceController } from '@http/controllers/balance.controller';
import { HealthController } from '@http/controllers/health.controller';
import { SyncController } from '@http/controllers/sync.controller';

export const timeOffModuleControllers = [BalanceController, HealthController, BalanceAuditController, SyncController];
