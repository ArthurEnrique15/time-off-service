// @ts-check
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  _comment:
    "This config mirrors the GCB service defaults. Expand the 'mutate' list feature-by-feature as the codebase grows.",
  packageManager: 'npm',
  reporters: ['html', 'clear-text', 'progress'],
  testRunner: 'jest',
  coverageAnalysis: 'perTest',
  mutate: [
    'src/shared/config/env/env.config.ts',
    'src/core/services/balance.service.ts',
    'src/core/services/balance-audit.service.ts',
    'src/core/services/time-off-request.service.ts',
    'src/shared/core/either/either.ts',
    'src/shared/core/custom-http/custom-http.service.ts',
    'src/shared/providers/hcm/hcm.client.ts',
    'src/core/services/batch-sync.service.ts',
    'src/http/controllers/sync.controller.ts',
  ],
  thresholds: { high: 100, low: 80, break: 80 },
};

export default config;
