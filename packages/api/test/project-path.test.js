import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

const {
  validateProjectPath,
  isUnderAllowedRoot,
  getAllowedRoots,
  getDefaultRootsForPlatform,
  isPathUnderRoots,
  getDefaultDenylistForPlatform,
  isPathDenied,
  isDenylistMode,
} = await import('../dist/utils/project-path.js');

// ── Denylist mode (new default — no env vars set) ───────────────────

describe('denylist mode (default, no PROJECT_ALLOWED_ROOTS)', () => {
  let savedAllowed;
  let savedAppend;
  let savedDenied;

  before(() => {
    savedAllowed = process.env.PROJECT_ALLOWED_ROOTS;
    savedAppend = process.env.PROJECT_ALLOWED_ROOTS_APPEND;
    savedDenied = process.env.PROJECT_DENIED_ROOTS;
    delete process.env.PROJECT_ALLOWED_ROOTS;
    delete process.env.PROJECT_ALLOWED_ROOTS_APPEND;
    delete process.env.PROJECT_DENIED_ROOTS;
  });

  after(() => {
    if (savedAllowed === undefined) delete process.env.PROJECT_ALLOWED_ROOTS;
    else process.env.PROJECT_ALLOWED_ROOTS = savedAllowed;
    if (savedAppend === undefined) delete process.env.PROJECT_ALLOWED_ROOTS_APPEND;
    else process.env.PROJECT_ALLOWED_ROOTS_APPEND = savedAppend;
    if (savedDenied === undefined) delete process.env.PROJECT_DENIED_ROOTS;
    else process.env.PROJECT_DENIED_ROOTS = savedDenied;
  });

  it('isDenylistMode() returns true', () => {
    assert.strictEqual(isDenylistMode(), true);
  });

  it('accepts home directory', () => {
    assert.strictEqual(isUnderAllowedRoot(join(homedir(), 'projects')), true);
  });

  it('accepts /tmp', () => {
    assert.strictEqual(isUnderAllowedRoot('/tmp/test-dir'), true);
  });

  it('accepts /opt (previously blocked by allowlist)', () => {
    assert.strictEqual(isUnderAllowedRoot('/opt/projects'), true);
  });

  it('accepts /usr/code (issue #228 Linux case)', () => {
    assert.strictEqual(isUnderAllowedRoot('/usr/code'), true);
  });

  it('accepts /srv, /mnt, /media paths', () => {
    assert.strictEqual(isUnderAllowedRoot('/srv/web'), true);
    assert.strictEqual(isUnderAllowedRoot('/mnt/data/project'), true);
    assert.strictEqual(isUnderAllowedRoot('/media/usb/code'), true);
  });

  it('rejects /proc (system virtual fs)', () => {
    assert.strictEqual(isUnderAllowedRoot('/proc/1/status'), false);
  });

  it('rejects /sys (kernel interface)', () => {
    assert.strictEqual(isUnderAllowedRoot('/sys/class/net'), false);
  });

  it('rejects /dev (device files)', () => {
    assert.strictEqual(isUnderAllowedRoot('/dev/null'), false);
  });

  it('rejects /boot', () => {
    assert.strictEqual(isUnderAllowedRoot('/boot/vmlinuz'), false);
  });

  it('rejects /sbin', () => {
    assert.strictEqual(isUnderAllowedRoot('/sbin/init'), false);
  });

  it('rejects /run', () => {
    assert.strictEqual(isUnderAllowedRoot('/run/user/1000'), false);
  });

  it('rejects /etc (system config, also gates write paths)', () => {
    assert.strictEqual(isUnderAllowedRoot('/etc/passwd'), false);
    assert.strictEqual(isUnderAllowedRoot('/etc'), false);
  });

  it('rejects filesystem root /', () => {
    assert.strictEqual(isUnderAllowedRoot('/'), false);
  });

  it('getAllowedRoots() returns !-prefixed denylist in denylist mode', () => {
    const roots = getAllowedRoots();
    assert.ok(Array.isArray(roots));
    assert.ok(roots.every((r) => r.startsWith('!')));
  });
});

// ── isPathDenied unit tests ─────────────────────────────────────────

describe('isPathDenied', () => {
  it('denies exact match on denied dir', () => {
    assert.strictEqual(isPathDenied('/proc', ['/proc'], 'linux'), true);
  });

  it('denies child of denied dir', () => {
    assert.strictEqual(isPathDenied('/proc/1/status', ['/proc'], 'linux'), true);
  });

  it('allows path not under any denied dir', () => {
    assert.strictEqual(isPathDenied('/home/user/code', ['/proc', '/sys'], 'linux'), false);
  });

  it('denies filesystem root /', () => {
    assert.strictEqual(isPathDenied('/', [], 'linux'), true);
  });

  it('denies Windows drive root C:\\', () => {
    assert.strictEqual(isPathDenied('C:\\', [], 'win32'), true);
  });

  it('allows Windows project path D:\\dev', () => {
    const winDeny = ['C:\\Windows'];
    assert.strictEqual(isPathDenied('D:\\dev\\project', winDeny, 'win32'), false);
  });

  it('denies Windows system path C:\\Windows\\System32', () => {
    const winDeny = ['C:\\Windows'];
    assert.strictEqual(isPathDenied('C:\\Windows\\System32', winDeny, 'win32'), true);
  });

  it('does not false-positive on prefix overlap (e.g. /devices vs /dev)', () => {
    assert.strictEqual(isPathDenied('/devices/custom', ['/dev'], 'linux'), false);
  });
});

// ── getDefaultDenylistForPlatform ───────────────────────────────────

describe('getDefaultDenylistForPlatform', () => {
  it('Linux denylist includes core system dirs', () => {
    const deny = getDefaultDenylistForPlatform('linux');
    assert.ok(deny.includes('/proc'));
    assert.ok(deny.includes('/sys'));
    assert.ok(deny.includes('/dev'));
    assert.ok(deny.includes('/boot'));
    assert.ok(deny.includes('/sbin'));
    assert.ok(deny.includes('/run'));
    assert.ok(deny.includes('/etc'));
  });

  it('macOS denylist includes /System and /private/etc', () => {
    const deny = getDefaultDenylistForPlatform('darwin');
    assert.ok(deny.includes('/dev'));
    assert.ok(deny.includes('/etc'));
    assert.ok(deny.includes('/System'));
    assert.ok(deny.includes('/private/etc'));
  });

  it('Windows denylist includes system root', () => {
    const deny = getDefaultDenylistForPlatform('win32');
    assert.ok(deny.length >= 1);
    // Should contain something like C:\Windows
    assert.ok(deny.some((d) => /windows/i.test(d) || d === process.env.SYSTEMROOT));
  });
});

// ── Legacy allowlist tests (getDefaultRootsForPlatform) ─────────────

describe('getDefaultRootsForPlatform (legacy allowlist)', () => {
  it('keeps Windows defaults scoped to the user home directory', () => {
    const roots = getDefaultRootsForPlatform('win32', {
      homeDir: 'C:\\Users\\share',
      pathExists: (target) => target === 'C:\\' || target === 'D:\\',
    });
    assert.deepStrictEqual(roots, ['C:\\Users\\share']);
    assert.strictEqual(isPathUnderRoots('C:\\Users\\share\\repo', roots, 'win32'), true);
    assert.strictEqual(isPathUnderRoots('C:\\Windows', roots, 'win32'), false);
    assert.strictEqual(isPathUnderRoots('D:\\other-user', roots, 'win32'), false);
  });
});

// ── validateProjectPath ─────────────────────────────────────────────

describe('validateProjectPath', () => {
  let testDir;
  let subDir;

  before(() => {
    // Ensure denylist mode
    delete process.env.PROJECT_ALLOWED_ROOTS;
    delete process.env.PROJECT_ALLOWED_ROOTS_APPEND;
    delete process.env.PROJECT_DENIED_ROOTS;

    testDir = mkdtempSync('/tmp/cat-cafe-test-path-validation-');
    subDir = join(testDir, 'project-a');
    mkdirSync(subDir, { recursive: true });
  });

  after(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('returns canonicalized path for valid directory', async () => {
    const result = await validateProjectPath(subDir);
    assert.ok(result);
    assert.strictEqual(result, await realpath(subDir));
  });

  it('returns null for nonexistent path', async () => {
    const result = await validateProjectPath('/nonexistent/path/xxx');
    assert.strictEqual(result, null);
  });

  it('returns null for path under denied root', async () => {
    const result = await validateProjectPath('/proc');
    assert.strictEqual(result, null);
  });

  it('returns null for /etc (denied, even though it exists)', async () => {
    // On macOS /etc → /private/etc; both must be denied
    const result = await validateProjectPath('/etc');
    assert.strictEqual(result, null);
  });

  it('returns null for file (not directory)', async () => {
    const { writeFileSync } = await import('node:fs');
    const filePath = join(testDir, 'not-a-dir.txt');
    writeFileSync(filePath, 'test');
    const result = await validateProjectPath(filePath);
    assert.strictEqual(result, null);
  });

  it('resolves symlinks and checks real path', async () => {
    const linkPath = join(testDir, 'link-to-tmp');
    if (existsSync(linkPath)) rmSync(linkPath);
    symlinkSync('/tmp', linkPath);
    const result = await validateProjectPath(linkPath);
    assert.ok(result);
  });

  it('rejects symlinks that escape to denied paths', async () => {
    const linkPath = join(testDir, 'link-to-proc');
    if (existsSync(linkPath)) rmSync(linkPath);
    try {
      symlinkSync('/proc', linkPath);
      const result = await validateProjectPath(linkPath);
      assert.strictEqual(result, null);
    } catch {
      // symlink creation may fail in sandboxed environments
    }
  });
});

// ── PROJECT_ALLOWED_ROOTS env var (legacy allowlist mode) ───────────

describe('PROJECT_ALLOWED_ROOTS env var (legacy allowlist mode)', () => {
  let savedEnv;
  let savedAppend;

  before(() => {
    savedEnv = process.env.PROJECT_ALLOWED_ROOTS;
    savedAppend = process.env.PROJECT_ALLOWED_ROOTS_APPEND;
  });

  after(() => {
    if (savedEnv === undefined) {
      delete process.env.PROJECT_ALLOWED_ROOTS;
    } else {
      process.env.PROJECT_ALLOWED_ROOTS = savedEnv;
    }
    if (savedAppend === undefined) {
      delete process.env.PROJECT_ALLOWED_ROOTS_APPEND;
    } else {
      process.env.PROJECT_ALLOWED_ROOTS_APPEND = savedAppend;
    }
  });

  it('switches to allowlist mode when env var is set', () => {
    process.env.PROJECT_ALLOWED_ROOTS = '/opt/projects';
    delete process.env.PROJECT_ALLOWED_ROOTS_APPEND;
    assert.strictEqual(isDenylistMode(), false);
  });

  it('replaces defaults when env var is set (backward compat)', () => {
    process.env.PROJECT_ALLOWED_ROOTS = '/opt/projects:/srv/data';
    delete process.env.PROJECT_ALLOWED_ROOTS_APPEND;
    assert.strictEqual(isUnderAllowedRoot('/opt/projects/my-app'), true);
    assert.strictEqual(isUnderAllowedRoot('/srv/data/files'), true);
    // Default roots should no longer work (replace mode is default)
    assert.strictEqual(isUnderAllowedRoot(join(homedir(), 'projects')), false);
    assert.strictEqual(isUnderAllowedRoot('/tmp/foo'), false);
  });

  it('appends to defaults when PROJECT_ALLOWED_ROOTS_APPEND=true', () => {
    process.env.PROJECT_ALLOWED_ROOTS = '/opt/projects:/srv/data';
    process.env.PROJECT_ALLOWED_ROOTS_APPEND = 'true';
    // Extra roots work
    assert.strictEqual(isUnderAllowedRoot('/opt/projects/my-app'), true);
    assert.strictEqual(isUnderAllowedRoot('/srv/data/files'), true);
    // Default roots still work (append mode)
    assert.strictEqual(isUnderAllowedRoot(join(homedir(), 'projects')), true);
    assert.strictEqual(isUnderAllowedRoot('/tmp/foo'), true);
  });

  it('uses legacy allowlist defaults when env var is empty (backward compat)', () => {
    process.env.PROJECT_ALLOWED_ROOTS = '';
    delete process.env.PROJECT_ALLOWED_ROOTS_APPEND;
    // Empty string is still "defined" → allowlist mode, not denylist
    assert.strictEqual(isDenylistMode(), false);
    // Home is in legacy defaults, so still allowed
    assert.strictEqual(isUnderAllowedRoot(join(homedir(), 'projects')), true);
    // /opt is NOT in legacy defaults → should be rejected
    assert.strictEqual(isUnderAllowedRoot('/opt/projects'), false);
  });

  it('handles multiple colon-separated paths', () => {
    process.env.PROJECT_ALLOWED_ROOTS = `/opt/a:/opt/b:${homedir()}`;
    delete process.env.PROJECT_ALLOWED_ROOTS_APPEND;
    assert.strictEqual(isUnderAllowedRoot('/opt/a/x'), true);
    assert.strictEqual(isUnderAllowedRoot('/opt/b/y'), true);
    assert.strictEqual(isUnderAllowedRoot(join(homedir(), 'z')), true);
    assert.strictEqual(isUnderAllowedRoot('/opt/c/w'), false);
  });

  it('getAllowedRoots() returns non-prefixed list in allowlist mode', () => {
    process.env.PROJECT_ALLOWED_ROOTS = '/opt/projects';
    delete process.env.PROJECT_ALLOWED_ROOTS_APPEND;
    const roots = getAllowedRoots();
    assert.ok(Array.isArray(roots));
    assert.ok(roots.every((r) => !r.startsWith('!')));
  });
});

// ── PROJECT_DENIED_ROOTS env var ────────────────────────────────────

describe('PROJECT_DENIED_ROOTS env var', () => {
  let savedAllowed;
  let savedDenied;

  before(() => {
    savedAllowed = process.env.PROJECT_ALLOWED_ROOTS;
    savedDenied = process.env.PROJECT_DENIED_ROOTS;
    delete process.env.PROJECT_ALLOWED_ROOTS;
  });

  after(() => {
    if (savedAllowed === undefined) delete process.env.PROJECT_ALLOWED_ROOTS;
    else process.env.PROJECT_ALLOWED_ROOTS = savedAllowed;
    if (savedDenied === undefined) delete process.env.PROJECT_DENIED_ROOTS;
    else process.env.PROJECT_DENIED_ROOTS = savedDenied;
  });

  it('adds custom denied paths to defaults', () => {
    process.env.PROJECT_DENIED_ROOTS = '/custom/secret:/internal/data';
    assert.strictEqual(isUnderAllowedRoot('/custom/secret/files'), false);
    assert.strictEqual(isUnderAllowedRoot('/internal/data/db'), false);
    // Default denies still work
    assert.strictEqual(isUnderAllowedRoot('/proc/1'), false);
    // Non-denied paths still allowed
    assert.strictEqual(isUnderAllowedRoot('/opt/projects'), true);
  });
});

// ── isPathUnderRoots (cross-drive Windows) ──────────────────────────

describe('isPathUnderRoots', () => {
  it('rejects cross-drive Windows paths when custom roots are configured', () => {
    assert.strictEqual(isPathUnderRoots('D:\\repo', ['C:\\work'], 'win32'), false);
    assert.strictEqual(isPathUnderRoots('C:\\work\\repo', ['C:\\work'], 'win32'), true);
  });
});
