import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { CustomHttpService } from './custom-http.service';

@Module({
  imports: [HttpModule],
  providers: [CustomHttpService],
  exports: [CustomHttpService],
})
export class CustomHttpModule {}
