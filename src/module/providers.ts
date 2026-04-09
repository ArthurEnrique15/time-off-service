import { BalanceService } from '@core/services/balance.service';
import { HealthService } from '@core/services/health.service';

export const timeOffModuleProviders = [BalanceService, HealthService];
