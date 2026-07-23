import path from 'node:path';
import { defineConfig } from '@playwright/test';

const artifactRoot = path.resolve(
  process.cwd(),
  '..',
  'artifacts',
  'ephemeral-staging'
);

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['line'],
    ['html', {
      outputFolder: path.join(artifactRoot, 'playwright-report'),
      open: 'never',
    }],
  ],
  outputDir: path.join(artifactRoot, 'playwright-results'),
  use: {
    baseURL: process.env.CI_FRONTEND_URL || 'http://127.0.0.1:4173',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
