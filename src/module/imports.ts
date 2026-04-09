import { PrismaModule } from '@app-prisma/prisma.module';

import { EnvConfigModule } from '@shared/config/env';
import { HcmModule } from '@shared/providers/hcm/hcm.module';

export const timeOffModuleImports = [EnvConfigModule, PrismaModule, HcmModule];
