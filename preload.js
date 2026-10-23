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
  setLanguage: (lang) => ipcRenderer.send('korforge:set-language', lang),
  // Cuenta de KoRForge: la app pregunta a centolos.org si esta cuenta está autorizada
  korforgeAuth: {
    estado: () => ipcRenderer.invoke('korforge:auth:estado'),
    login: (name, password) => ipcRenderer.invoke('korforge:auth:login', name, password),
    googleIniciar: () => ipcRenderer.invoke('korforge:auth:google:iniciar'),
    googleSondeo: (state) => ipcRenderer.invoke('korforge:auth:google:sondeo', state),
    salir: () => ipcRenderer.invoke('korforge:auth:salir'),
    onSesionCerrada: (callback) => ipcRenderer.on('korforge:sesion-cerrada', () => callback())
  }
});
