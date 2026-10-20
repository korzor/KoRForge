const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  getAppVersion: () => ipcRenderer.invoke('app-version'),
  onMaximizedChange: (callback) => ipcRenderer.on('window-maximized-change', (_, isMax) => callback(isMax)),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  // Traduce la interfaz nativa (bandeja del sistema) al idioma elegido en la app
  setLanguage: (lang) => ipcRenderer.send('korforge:set-language', lang)
});
