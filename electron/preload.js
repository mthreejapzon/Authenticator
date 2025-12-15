const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Secure Store API (mimics expo-secure-store)
  secureStore: {
    getItemAsync: (key) => ipcRenderer.invoke('secureStore:getItem', key),
    setItemAsync: (key, value) => ipcRenderer.invoke('secureStore:setItem', key, value),
    deleteItemAsync: (key) => ipcRenderer.invoke('secureStore:deleteItem', key)
  },

  // Clipboard API (mimics expo-clipboard)
  clipboard: {
    setStringAsync: (text) => ipcRenderer.invoke('clipboard:setString', text),
    getStringAsync: () => ipcRenderer.invoke('clipboard:getString')
  },

  // Platform Info
  platform: {
    getInfo: () => ipcRenderer.invoke('platform:getInfo')
  },

  // Check if running in Electron
  isElectron: true
});
