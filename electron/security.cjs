function secureStorageAvailable(storage, platform = process.platform) {
  if (!storage.isEncryptionAvailable()) return false;
  return platform !== 'linux' || ['gnome_libsecret', 'kwallet', 'kwallet5', 'kwallet6'].includes(storage.getSelectedStorageBackend());
}

function trustedSender(event, windows, expectedUrl) {
  return windows.some(win => !win.isDestroyed() &&
    event.sender === win.webContents &&
    event.senderFrame === win.webContents.mainFrame &&
    event.senderFrame?.url === expectedUrl);
}

function validateSecrets(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid secrets');
  const secrets = {};
  for (const [key, secret] of Object.entries(value)) {
    if (!['apiKey', 'fallbackApiKey'].includes(key) || typeof secret !== 'string' || secret.length > 16384) {
      throw new Error('Invalid secrets');
    }
    secrets[key] = secret;
  }
  return secrets;
}

module.exports = { secureStorageAvailable, trustedSender, validateSecrets };
