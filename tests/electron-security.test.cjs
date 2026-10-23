const { test } = require('node:test');
const assert = require('node:assert/strict');
const { secureStorageAvailable, trustedSender, validateSecrets } = require('../electron/security.cjs');

test('only the app main frame in a known window may access secrets', () => {
  const expected = 'file:///application/dist/index.html';
  const mainFrame = { url: expected };
  const contents = { mainFrame };
  const windows = [{ isDestroyed: () => false, webContents: contents }];
  assert.equal(trustedSender({ sender: contents, senderFrame: mainFrame }, windows, expected), true);
  assert.equal(trustedSender({ sender: {}, senderFrame: mainFrame }, windows, expected), false);
  assert.equal(trustedSender({ sender: contents, senderFrame: { url: expected } }, windows, expected), false);
  mainFrame.url = 'https://untrusted.example';
  assert.equal(trustedSender({ sender: contents, senderFrame: mainFrame }, windows, expected), false);
  mainFrame.url = expected + '?untrusted';
  assert.equal(trustedSender({ sender: contents, senderFrame: mainFrame }, windows, expected), false);
});

test('Linux basic_text and unavailable key stores never count as secure storage', () => {
  const storage = { isEncryptionAvailable: () => true, getSelectedStorageBackend: () => 'basic_text' };
  assert.equal(secureStorageAvailable(storage, 'linux'), false);
  assert.equal(secureStorageAvailable(storage, 'win32'), true);
  storage.getSelectedStorageBackend = () => 'gnome_libsecret';
  assert.equal(secureStorageAvailable(storage, 'linux'), true);
  storage.isEncryptionAvailable = () => false;
  assert.equal(secureStorageAvailable(storage, 'win32'), false);
});

test('secret IPC rejects unexpected fields, types and excessive input', () => {
  for (const value of [null, [], { apiKey: 123 }, { arbitraryFile: 'x' }, { apiKey: 'x'.repeat(16385) }]) {
    assert.throws(() => validateSecrets(value), /Invalid secrets/);
  }
  assert.deepEqual(validateSecrets({ apiKey: 'synthetic-key', fallbackApiKey: '' }), { apiKey: 'synthetic-key', fallbackApiKey: '' });
});
