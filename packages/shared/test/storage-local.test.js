import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { localPathFor, isLocalStorage, publicUrl } from '../../../apps/web/lib/storage.ts';

test('a normal key resolves inside the storage root', () => {
  const p = localPathFor('public/ecards/class-1.svg');
  assert.ok(p);
  assert.ok(p.endsWith(path.join('public', 'ecards', 'class-1.svg')));
});

test('traversal cannot escape the storage root', () => {
  // These arrive from a URL, so `../` must never walk up to the rest of the disk.
  for (const key of [
    '../../../../package.json',
    'public/../../../../etc/passwd',
    '../secret',
    'public/../../../windows/win.ini',
  ]) {
    assert.equal(localPathFor(key), null, `should refuse: ${key}`);
  }
});

test('an absolute key is refused, not resolved against the filesystem root', () => {
  // path.resolve would turn this into C:\etc\passwd on Windows. It must be rejected.
  assert.equal(localPathFor('/etc/passwd'), null);
  assert.equal(localPathFor('/windows/win.ini'), null);
});

test('local disk storage is opt-in, not automatic', () => {
  const saved = { ...process.env };
  delete process.env.S3_ENDPOINT;
  delete process.env.STORAGE_LOCAL;
  process.env.NODE_ENV = 'development';
  assert.equal(isLocalStorage(), false, 'no implicit fallback when S3 is unconfigured');

  process.env.STORAGE_LOCAL = 'true';
  assert.equal(isLocalStorage(), true, 'opted in explicitly');

  // Opting in while a real endpoint exists is a config mistake, not a silent choice.
  process.env.S3_ENDPOINT = 'https://example.r2.cloudflarestorage.com';
  assert.throws(() => isLocalStorage(), /conflicts with S3_ENDPOINT/);

  delete process.env.S3_ENDPOINT;
  process.env.NODE_ENV = 'production';
  assert.throws(() => isLocalStorage(), /must not be enabled in production/);

  process.env = saved;
});

test('a local public URL points at the file route, not at S3', () => {
  const saved = { ...process.env };
  delete process.env.S3_ENDPOINT;
  process.env.STORAGE_LOCAL = 'true';
  process.env.NODE_ENV = 'development';
  assert.equal(publicUrl('ecards/a.svg'), '/api/files/ecards/a.svg');
  process.env = saved;
});