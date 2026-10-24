const { contextBridge, ipcRenderer } = require('electron');

/**
 * Puente entre la página y Electron. Solo lo mínimo y con nombre propio: la página NUNCA toca
 * `require` ni `ipcRenderer` (contextIsolation está activado).
 */
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

  /**
   * Portapapeles del menú contextual propio (dueño, 24-10-2026).
   * La página no puede leer ni escribir el portapapeles por su cuenta, así que se lo pide al
   * proceso principal. Cada método es lo mismo que su atajo de teclado, sobre lo que tenga el foco.
   */
  portapapeles: {
    cortar: () => ipcRenderer.invoke('korforge:portapapeles', 'cortar'),
    copiar: () => ipcRenderer.invoke('korforge:portapapeles', 'copiar'),
    pegar: () => ipcRenderer.invoke('korforge:portapapeles', 'pegar'),
    seleccionarTodo: () => ipcRenderer.invoke('korforge:portapapeles', 'seleccionarTodo'),
    hayTexto: () => ipcRenderer.invoke('korforge:portapapeles-hay-texto'),

    /**
     * Copia un texto que pone la app (botón de compartir un addon, dueño 25-10-2026).
     * No es el «Copiar» de arriba: aquel copia la selección del campo con el foco.
     */
    copiarTexto: (texto) => ipcRenderer.invoke('korforge:copiar-texto', texto),
  },
});
