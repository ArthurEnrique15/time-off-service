import { Body, Controller, HttpCode, Post } from '@nestjs/common';

import { BatchSyncService, type BatchSyncResult } from '@core/services/batch-sync.service';
import { BatchSyncRequestDto } from '@http/dto/batch-sync.dto';

@Controller('sync')
export class SyncController {
  constructor(private readonly batchSyncService: BatchSyncService) {}

  @Post('batch')
  @HttpCode(200)
  syncBatch(@Body() dto: BatchSyncRequestDto): Promise<BatchSyncResult> {
    return this.batchSyncService.syncBatch(dto.balances);
  }
}
