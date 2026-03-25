import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('detectAvailableClients marks dare available when vendored runtime exists', async () => {
  const dareRoot = mkdtempSync(join(tmpdir(), 'dare-client-detect-'));
  const oldDarePath = process.env.DARE_PATH;
  const oldAllowedClients = process.env.CAT_CAFE_ALLOWED_CLIENTS;

  try {
    mkdirSync(join(dareRoot, 'client'), { recursive: true });
    mkdirSync(join(dareRoot, '.venv', 'bin'), { recursive: true });
    writeFileSync(join(dareRoot, 'client', '__main__.py'), '', 'utf8');
    writeFileSync(join(dareRoot, '.venv', 'bin', 'python'), '#!/usr/bin/env python\n', 'utf8');

    process.env.DARE_PATH = dareRoot;
    process.env.CAT_CAFE_ALLOWED_CLIENTS = 'dare';

    const { refreshAvailableClients } = await import('../dist/utils/client-detection.js');
    const clients = await refreshAvailableClients();

    assert.deepEqual(clients, [{ id: 'dare', label: 'Dare', command: 'dare', available: true }]);
  } finally {
    if (oldDarePath === undefined) delete process.env.DARE_PATH;
    else process.env.DARE_PATH = oldDarePath;
    if (oldAllowedClients === undefined) delete process.env.CAT_CAFE_ALLOWED_CLIENTS;
    else process.env.CAT_CAFE_ALLOWED_CLIENTS = oldAllowedClients;

    const { refreshAvailableClients } = await import('../dist/utils/client-detection.js');
    await refreshAvailableClients();
    rmSync(dareRoot, { recursive: true, force: true });
  }
});
