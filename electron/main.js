const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const keytar = require('keytar');
const crypto = require('crypto');

// Use system keychain for encryption key storage
const SERVICE_NAME = 'com.authenticator.app';
const ACCOUNT_NAME = 'encryption-key';
const STORE_FILE = 'authenticator-data.json';

// Store using Node.js fs with encryption
const fs = require('fs');
const os = require('os');
const storePath = path.join(app.getPath('userData'), STORE_FILE);

/**
 * Get or create encryption key from system keychain
 * This uses the OS keychain (macOS Keychain, Windows Credential Manager, Linux Secret Service)
 */
async function getOrCreateEncryptionKey() {
  try {
    // Try to get existing key from system keychain
    let key = await keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME);

    if (!key) {
      // Generate a new 256-bit key
      key = crypto.randomBytes(32).toString('hex');

      // Store in system keychain (OS-level security)
      await keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, key);
      console.log('New encryption key generated and stored in system keychain');
    }

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

  async init() {
    if (this.initialized) return;

    this.encryptionKey = await getOrCreateEncryptionKey();

    // Load existing data if available
    if (fs.existsSync(storePath)) {
      try {
        const encryptedContent = fs.readFileSync(storePath, 'utf8');
        const parsed = JSON.parse(encryptedContent);
        const decryptedData = decrypt(parsed, this.encryptionKey);
        this.data = JSON.parse(decryptedData);
      } catch (error) {
        console.error('Error loading encrypted data:', error);
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
  const startUrl = process.env.ELECTRON_START_URL || `file://${path.join(__dirname, '../dist/index.html')}`;

  mainWindow.loadURL(startUrl);

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App lifecycle - initialize store before creating window
app.whenReady().then(async () => {
  await store.init();
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
