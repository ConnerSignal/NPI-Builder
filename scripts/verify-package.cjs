const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const asar = require('@electron/asar');

const archive = process.argv[2] || 'release/win-unpacked/resources/app.asar';
const entries = asar.listPackage(archive).map(entry => entry.replace(/^[\\/]/, '').replace(/\\/g, '/'));
const files = entries.filter(entry => !asar.statFile(archive, entry.split('/').join(path.sep)).files);
const appFiles = files.filter(entry => !entry.startsWith('node_modules/'));
const allowed = /^(package\.json|electron\/(main|preload|security)\.cjs|dist\/(index\.html|npi-builder-logo\.jpg|assets\/[^/]+\.(js|css|jpg)))$/;
for (const entry of appFiles) assert.match(entry, allowed, `Unexpected application file: ${entry}`);
for (const entry of ['electron/main.cjs', 'electron/preload.cjs', 'electron/security.cjs', 'dist/index.html']) {
  assert.ok(entries.includes(entry), `Missing ${entry}`);
  assert.ok(asar.extractFile(archive, entry.split('/').join(path.sep)).equals(fs.readFileSync(entry)), `Stale ${entry}`);
}
for (const entry of appFiles.filter(entry => /\.(js|cjs|html|json)$/.test(entry))) {
  const content = asar.extractFile(archive, entry.split('/').join(path.sep)).toString();
  assert.doesNotMatch(content, /SmartOps|primary-test-secret|old-stored-key|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/, `Residual content: ${entry}`);
}
console.log(`Package verified: ${appFiles.length} application files; no nested runtime, tests, logs, or sample data.`);
