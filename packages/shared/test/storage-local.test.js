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

test('local mode is chosen when no S3 endpoint is configured outside production', () => {
  const prevEndpoint = process.env.S3_ENDPOINT;
  const prevNodeEnv = process.env.NODE_ENV;
  delete process.env.S3_ENDPOINT;
  process.env.NODE_ENV = 'development';
  assert.equal(isLocalStorage(), true, 'dev with no endpoint uses local disk');

  // Production must never silently write to disk.
  process.env.NODE_ENV = 'production';
  assert.equal(isLocalStorage(), false, 'production requires real storage config');
  process.env.S3_ENDPOINT = 'https://example.r2.cloudflarestorage.com';
  assert.equal(isLocalStorage(), false, 'configured endpoint uses S3');

  if (prevEndpoint === undefined) delete process.env.S3_ENDPOINT;
  else process.env.S3_ENDPOINT = prevEndpoint;
  process.env.NODE_ENV = prevNodeEnv;
});

test('a local public URL points at the file route, not at S3', () => {
  const prevEndpoint = process.env.S3_ENDPOINT;
  const prevNodeEnv = process.env.NODE_ENV;
  delete process.env.S3_ENDPOINT;
  process.env.NODE_ENV = 'development';
  assert.equal(publicUrl('ecards/a.svg'), '/api/files/ecards/a.svg');
  if (prevEndpoint === undefined) delete process.env.S3_ENDPOINT;
  else process.env.S3_ENDPOINT = prevEndpoint;
  process.env.NODE_ENV = prevNodeEnv;
});