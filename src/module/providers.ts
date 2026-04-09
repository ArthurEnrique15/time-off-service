import { BalanceAuditService } from '@core/services/balance-audit.service';
import { BalanceService } from '@core/services/balance.service';
import { HealthService } from '@core/services/health.service';
import { TimeOffRequestService } from '@core/services/time-off-request.service';

export const timeOffModuleProviders = [BalanceService, HealthService, BalanceAuditService, TimeOffRequestService];
