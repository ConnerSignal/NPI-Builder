const { app, BrowserWindow, ipcMain, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');

const isDev = !app.isPackaged;
const SECURE_STORE_FILE = 'npi-secure-store.json';

function getSecureStorePath() {
  return path.join(app.getPath('userData'), SECURE_STORE_FILE);
}

function readSecureSecrets() {
  if (!safeStorage.isEncryptionAvailable()) return {};

  try {
    const filePath = getSecureStorePath();
    if (!fs.existsSync(filePath)) return {};

    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const secrets = {};

    if (raw.apiKey) {
      secrets.apiKey = safeStorage.decryptString(Buffer.from(raw.apiKey, 'base64'));
    }
    if (raw.fallbackApiKey) {
      secrets.fallbackApiKey = safeStorage.decryptString(Buffer.from(raw.fallbackApiKey, 'base64'));
    }

    return secrets;
  } catch (error) {
    console.warn('Failed to read secure secrets:', error);
    return {};
  }
}

function writeSecureSecrets(nextSecrets) {
  if (!safeStorage.isEncryptionAvailable()) return false;

  try {
    const secrets = {};

    if (nextSecrets.apiKey) {
      secrets.apiKey = safeStorage.encryptString(nextSecrets.apiKey).toString('base64');
    }
    if (nextSecrets.fallbackApiKey) {
      secrets.fallbackApiKey = safeStorage.encryptString(nextSecrets.fallbackApiKey).toString('base64');
    }

    fs.writeFileSync(getSecureStorePath(), JSON.stringify(secrets, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.warn('Failed to write secure secrets:', error);
    return false;
  }
}

function clearSecureSecrets() {
  try {
    const filePath = getSecureStorePath();
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return true;
  } catch (error) {
    console.warn('Failed to clear secure secrets:', error);
    return false;
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: 'NPI Builder',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
    show: false,
  });

  // Use the same NPI Builder artwork for the dev window, packaged window,
  // taskbar, executable, and desktop shortcut icon.
  const iconPath = isDev
    ? path.join(__dirname, '../public/npi-builder-logo.ico')
    : path.join(process.resourcesPath, 'icon.ico');
  try { win.setIcon(iconPath); } catch (e) { console.warn('Could not set window icon:', e); }

  if (isDev) {
    win.loadURL('http://localhost:5173');
    // win.webContents.openDevTools({ mode: 'detach' });
  } else {
    // Use app.getAppPath() for reliable resolution inside packaged apps (handles asar, resources, portable layout).
    const indexPath = path.join(app.getAppPath(), 'dist', 'index.html');
    win.loadFile(indexPath);
  }

  // Allow opening DevTools in the built app with F12 or Ctrl+Shift+I (very useful for diagnosing blank screens / JS errors)
  win.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      win.webContents.toggleDevTools();
    }
  });

  win.once('ready-to-show', () => win.show());
}

app.whenReady().then(() => {
  ipcMain.handle('npi-secure-store:available', () => safeStorage.isEncryptionAvailable());
  ipcMain.handle('npi-secure-store:get', () => readSecureSecrets());
  ipcMain.handle('npi-secure-store:set', (_event, partialSecrets) => {
    const merged = { ...readSecureSecrets(), ...partialSecrets };
    return writeSecureSecrets(merged);
  });
  ipcMain.handle('npi-secure-store:clear', () => clearSecureSecrets());

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
