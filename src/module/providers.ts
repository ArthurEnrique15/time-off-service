import { HealthService } from '@core/services/health.service';
import { BalanceAuditService } from '@core/services/balance-audit.service';

export const timeOffModuleProviders = [HealthService, BalanceAuditService];
