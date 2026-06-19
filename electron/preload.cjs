const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('npiSecureStore', {
  isAvailable: () => ipcRenderer.invoke('npi-secure-store:available'),
  getSecrets: () => ipcRenderer.invoke('npi-secure-store:get'),
  setSecrets: (partialSecrets) => ipcRenderer.invoke('npi-secure-store:set', partialSecrets),
  clearSecrets: () => ipcRenderer.invoke('npi-secure-store:clear'),
});