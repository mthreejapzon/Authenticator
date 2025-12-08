const { app, BrowserWindow, ipcMain, safeStorage, protocol, net } = require('electron');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

// Use system keychain for encryption key storage
const STORE_FILE = 'authenticator-data.json';
const KEY_FILE = 'encryption-key.enc';

// Store paths
const storePath = path.join(app.getPath('userData'), STORE_FILE);
const keyPath = path.join(app.getPath('userData'), KEY_FILE);

/**
 * Get or create encryption key using Electron's safeStorage API
 * This uses the OS keychain (macOS Keychain, Windows Credential Manager, Linux Secret Service)
 */
function getOrCreateEncryptionKey() {
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Encryption is not available on this system');
    }

    // Try to get existing key
    if (fs.existsSync(keyPath)) {
      const encryptedKey = fs.readFileSync(keyPath);
      const decryptedKey = safeStorage.decryptString(encryptedKey);
      return decryptedKey;
    }

    // Generate a new 256-bit key
    const key = crypto.randomBytes(32).toString('hex');

    // Encrypt and store using OS keychain
    const encryptedKey = safeStorage.encryptString(key);
    fs.writeFileSync(keyPath, encryptedKey);
    console.log('New encryption key generated and stored in system keychain');

    return key;
  } catch (error) {
    console.error('Error accessing system keychain:', error);
    throw new Error('Failed to access secure storage');
  }
}

/**
 * Encrypt data using AES-256-GCM
 */
function encrypt(text, key) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return {
    iv: iv.toString('hex'),
    data: encrypted,
    tag: authTag.toString('hex')
  };
}

/**
 * Decrypt data using AES-256-GCM
 */
function decrypt(encryptedData, key) {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    Buffer.from(key, 'hex'),
    Buffer.from(encryptedData.iv, 'hex')
  );

  decipher.setAuthTag(Buffer.from(encryptedData.tag, 'hex'));

  let decrypted = decipher.update(encryptedData.data, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Secure store implementation
 */
class SecureStore {
  constructor() {
    this.data = {};
    this.encryptionKey = null;
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;

    this.encryptionKey = getOrCreateEncryptionKey();

    // Load existing data if available
    if (fs.existsSync(storePath)) {
      try {
        const encryptedContent = fs.readFileSync(storePath, 'utf8');
        const parsed = JSON.parse(encryptedContent);
        const decryptedData = decrypt(parsed, this.encryptionKey);
        this.data = JSON.parse(decryptedData);
      } catch (error) {
        console.error('Error loading encrypted data:', error);
        console.log('Starting with fresh data store');
        // Delete corrupted file and start fresh
        try {
          fs.unlinkSync(storePath);
        } catch (e) {
          // Ignore deletion errors
        }
        this.data = {};
      }
    }

    this.initialized = true;
  }

  async save() {
    const dataString = JSON.stringify(this.data);
    const encrypted = encrypt(dataString, this.encryptionKey);
    fs.writeFileSync(storePath, JSON.stringify(encrypted), 'utf8');
  }

  get(key) {
    return this.data[key];
  }

  set(key, value) {
    this.data[key] = value;
    this.save();
  }

  delete(key) {
    delete this.data[key];
    this.save();
  }
}

const store = new SecureStore();

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    },
    titleBarStyle: 'hiddenInset',
    icon: path.join(__dirname, '../assets/icon.png')
  });

  // Load the Expo web app
  // Use custom protocol for SPA routing - load from root to fix relative paths
  const startUrl = process.env.ELECTRON_START_URL || 'app://./';

  mainWindow.loadURL(startUrl);

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  // Log any load failures
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('Failed to load:', validatedURL, errorCode, errorDescription);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App ready handler
app.whenReady().then(() => {
  // Register custom protocol to serve the SPA
  protocol.handle('app', (request) => {
    let filePath = request.url.replace('app://', '');

    // Remove query strings and hashes
    filePath = filePath.split('?')[0].split('#')[0];

    // Remove any leading slashes
    filePath = filePath.replace(/^\/+/, '');

    // Default to index.html for SPA routing (only if no extension and not an asset path)
    if (!filePath || filePath === '' || (!path.extname(filePath) && !filePath.startsWith('_expo/'))) {
      filePath = 'index.html';
    }

    const fullPath = path.join(__dirname, '../dist', filePath);
    return net.fetch('file://' + fullPath);
  });

  store.init();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC Handlers for secure storage (mimics expo-secure-store API)
ipcMain.handle('secureStore:getItem', async (event, key) => {
  try {
    return store.get(key) || null;
  } catch (error) {
    console.error('Error getting item from store:', error);
    return null;
  }
});

ipcMain.handle('secureStore:setItem', async (event, key, value) => {
  try {
    store.set(key, value);
    return true;
  } catch (error) {
    console.error('Error setting item in store:', error);
    throw error;
  }
});

ipcMain.handle('secureStore:deleteItem', async (event, key) => {
  try {
    store.delete(key);
    return true;
  } catch (error) {
    console.error('Error deleting item from store:', error);
    throw error;
  }
});

// Clipboard API
ipcMain.handle('clipboard:setString', async (event, text) => {
  const { clipboard } = require('electron');
  clipboard.writeText(text);
  return true;
});

ipcMain.handle('clipboard:getString', async () => {
  const { clipboard } = require('electron');
  return clipboard.readText();
});

// Platform info
ipcMain.handle('platform:getInfo', async () => {
  return {
    platform: process.platform,
    version: app.getVersion(),
    isElectron: true
  };
});
