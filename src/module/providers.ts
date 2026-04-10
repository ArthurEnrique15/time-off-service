import { BalanceAuditService } from '@core/services/balance-audit.service';
import { BalanceService } from '@core/services/balance.service';
import { BatchSyncService } from '@core/services/batch-sync.service';
import { HealthService } from '@core/services/health.service';

export const timeOffModuleProviders = [BalanceService, HealthService, BalanceAuditService, BatchSyncService];
