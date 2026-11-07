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

function validateNetworkRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid network request');
  const url = typeof value.url === 'string' ? value.url : '';
  const method = value.method;
  const timeoutMs = value.timeoutMs;
  const body = value.body;
  const headers = value.headers;

  let parsed;
  try { parsed = new URL(url); } catch { throw new Error('Invalid URL'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Invalid URL protocol');
  if (parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('URL must not include credentials, query, or fragment');
  if (parsed.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)) {
    throw new Error('Remote HTTP is not allowed');
  }

  if (!['GET', 'POST'].includes(method)) throw new Error('Invalid HTTP method');
  if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 120_000) {
    throw new Error('Invalid timeout');
  }
  if (body !== undefined && typeof body !== 'string') throw new Error('Invalid request body');
  if (typeof body === 'string' && body.length > 512_000) throw new Error('Request body too large');

  const cleanHeaders = {};
  if (headers !== undefined) {
    if (!headers || typeof headers !== 'object' || Array.isArray(headers)) throw new Error('Invalid headers');
    const allowlist = new Set(['accept', 'authorization', 'content-type']);
    for (const [rawKey, rawValue] of Object.entries(headers)) {
      if (typeof rawValue !== 'string' || rawValue.length > 16_384) throw new Error('Invalid header value');
      const key = String(rawKey).toLowerCase();
      if (!allowlist.has(key)) throw new Error('Header not allowed');
      cleanHeaders[key] = rawValue;
    }
  }

  return {
    url: parsed.toString(),
    method,
    timeoutMs,
    body: typeof body === 'string' ? body : undefined,
    headers: cleanHeaders,
  };
}

module.exports = { secureStorageAvailable, trustedSender, validateSecrets, validateNetworkRequest };
