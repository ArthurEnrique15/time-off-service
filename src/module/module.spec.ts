import { PrismaModule } from '@app-prisma/prisma.module';

import { BalanceAuditService } from '@core/services/balance-audit.service';
import { BalanceService } from '@core/services/balance.service';
import { HealthService } from '@core/services/health.service';

import { BalanceAuditController } from '@http/controllers/balance-audit.controller';
import { BalanceController } from '@http/controllers/balance.controller';
import { HealthController } from '@http/controllers/health.controller';

import { timeOffModuleControllers } from '@module/controllers';
import { timeOffModuleImports } from '@module/imports';
import { timeOffModuleProviders } from '@module/providers';

import { EnvConfigModule } from '@shared/config/env';
import { HcmModule } from '@shared/providers/hcm/hcm.module';

describe('time-off module assembly', () => {
  it('declares the expected imports', () => {
    expect(timeOffModuleImports).toEqual([EnvConfigModule, PrismaModule, HcmModule]);
  });

  it('declares the expected providers', () => {
    expect(timeOffModuleProviders).toEqual([BalanceService, HealthService, BalanceAuditService]);
  });

  it('declares the expected controllers', () => {
    expect(timeOffModuleControllers).toEqual([BalanceController, HealthController, BalanceAuditController]);
  });
});
