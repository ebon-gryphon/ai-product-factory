import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lstatSync, mkdirSync, mkdtempSync, readlinkSync, rmSync, symlinkSync } from 'fs';
import os from 'os';
import path from 'path';

const paths = vi.hoisted(() => ({ home: '', data: '' }));
vi.mock('@/common/platform', () => ({
  getPlatformServices: () => ({
    paths: {
      getHomeDir: () => paths.home,
      getDataDir: () => paths.data,
      needsCliSafeSymlinks: () => true,
    },
  }),
}));
vi.mock('@/common/config/appEnv', () => ({ getEnvAwareName: (name: string) => `${name}-dev` }));
import { getConfigPath, getDataPath } from '@process/utils/utils';

describe('E2E data path isolation', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'factory-path-test-'));
    paths.home = path.join(root, 'home');
    paths.data = path.join(root, 'test-userdata');
    mkdirSync(paths.home);
    mkdirSync(paths.data);
    vi.stubEnv('AIONUI_E2E_TEST', '1');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });

  it('leaves live data and config links intact after test data cleanup', () => {
    for (const [name, getPath, folder] of [
      ['.aionui-dev', getDataPath, 'aionui'],
      ['.aionui-config-dev', getConfigPath, 'config'],
    ] as const) {
      const live = path.join(root, `live-${folder}`);
      mkdirSync(live);
      const link = path.join(paths.home, name);
      symlinkSync(live, link);
      expect(getPath()).toBe(path.join(paths.data, folder));
      expect(readlinkSync(link)).toBe(live);
    }
    rmSync(paths.data, { recursive: true });
    expect(lstatSync(path.join(paths.home, '.aionui-dev')).isSymbolicLink()).toBe(true);
  });

  it('does not create a shared link when the test is the first instance', () => {
    expect(getDataPath()).toBe(path.join(paths.data, 'aionui'));
    expect(() => lstatSync(path.join(paths.home, '.aionui-dev'))).toThrow();
  });

  it('keeps normal desktop CLI-safe path behavior', () => {
    vi.stubEnv('AIONUI_E2E_TEST', '0');
    const link = getDataPath();
    expect(link).toBe(path.join(paths.home, '.aionui-dev'));
    expect(readlinkSync(link)).toBe(path.join(paths.data, 'aionui'));
  });
});
