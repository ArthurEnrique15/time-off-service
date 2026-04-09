import { Module } from '@nestjs/common';

import { timeOffModuleControllers } from './controllers';
import { timeOffModuleImports } from './imports';
import { timeOffModuleProviders } from './providers';

@Module({
  imports: timeOffModuleImports,
  providers: timeOffModuleProviders,
  controllers: timeOffModuleControllers,
})
export class TimeOffModule {}
