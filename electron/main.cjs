const { app, BrowserWindow } = require('electron');
const path = require('path');

const isDev = !app.isPackaged;

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
    },
    show: false,
  });

  // Set the custom NPI Builder logo as window icon.
  // For best Windows taskbar/exe icon UX, a .ico with multiple sizes is ideal,
  // but the jpg works for the runtime window icon.
  const iconPath = isDev 
    ? path.join(__dirname, '../public/npi-builder-logo.jpg')
    : path.join(app.getAppPath(), 'npi-builder-logo.jpg');
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
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
