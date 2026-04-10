import { Test, TestingModule } from '@nestjs/testing';

import { BatchSyncService } from '@core/services/batch-sync.service';
import { SyncController } from '@http/controllers/sync.controller';

describe('SyncController', () => {
  let controller: SyncController;

  const mockResult = {
    summary: { created: 1, updated: 0, unchanged: 0, conflicted: 0, failed: 0 },
    conflicts: [],
    errors: [],
  };

  const mockBatchSyncService = {
    syncBatch: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SyncController],
      providers: [{ provide: BatchSyncService, useValue: mockBatchSyncService }],
    }).compile();

    controller = module.get<SyncController>(SyncController);
  });

  describe('syncBatch', () => {
    it('delegates to batchSyncService.syncBatch with the dto balances and returns the result', async () => {
      mockBatchSyncService.syncBatch.mockResolvedValue(mockResult);

      const dto = { balances: [{ employeeId: 'emp-1', locationId: 'loc-1', availableDays: 10 }] };
      const result = await controller.syncBatch(dto as any);

      expect(result).toEqual(mockResult);
      expect(mockBatchSyncService.syncBatch).toHaveBeenCalledWith(dto.balances);
    });
  });
});
