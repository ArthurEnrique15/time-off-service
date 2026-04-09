import { BalanceAuditService } from '@core/services/balance-audit.service';
import { HealthService } from '@core/services/health.service';

export const timeOffModuleProviders = [HealthService, BalanceAuditService];
