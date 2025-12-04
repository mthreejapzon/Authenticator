# Electron Desktop App - Quick Start Guide

## TL;DR - Get Started Now

```bash
# Run in development mode (hot reload enabled)
npm run electron:dev

# Build for your current platform
npm run electron:build

# Build for specific platforms
npm run electron:build:mac      # macOS
npm run electron:build:win      # Windows
npm run electron:build:linux    # Linux
```

## What You Get

Your Authenticator app now runs as a **native desktop application** on:
- macOS (10.15+)
- Windows (10/11)
- Linux (Ubuntu 20.04+)

## Key Features

✅ Native window controls
✅ Encrypted local storage (better than browser)
✅ Offline-first (no internet required)
✅ System clipboard integration
✅ Cross-platform (one codebase)
✅ Auto-updates capable

## How It Works

```
Mobile (iOS/Android) ─┐
                      ├─→ Your React Native Code
Web (Browser)        ─┤
                      └─→ Cross-Platform Storage Adapter
Desktop (Electron)   ─┘
```

The app automatically detects the platform and uses the right APIs.

## File Overview

```
electron/
├── main.js      → Electron entry point (window + system APIs)
└── preload.js   → Secure bridge (IPC communication)

app/utils/
└── storage.ts   → Works on mobile, web, AND desktop
```

## Commands Cheat Sheet

| Command | What It Does |
|---------|--------------|
| `npm run electron:dev` | Launch dev mode with hot-reload |
| `npm run electron:build` | Build installer for your OS |
| `npm run electron:build:mac` | Build macOS .dmg installer |
| `npm run electron:build:win` | Build Windows .exe installer |
| `npm run electron:build:linux` | Build Linux .AppImage |
| `npm run export:web` | Export web bundle for Electron |

## Development Workflow

1. **Start development:**
   ```bash
   npm run electron:dev
   ```
   This opens the app AND starts the dev server.

2. **Make changes:**
   Edit any file in `app/` and see changes instantly.

3. **Test changes:**
   The app auto-reloads on file save.

4. **Build for production:**
   ```bash
   npm run electron:build
   ```
   Find the installer in `dist/` folder.

## Storage Works Everywhere

Use the same code on all platforms:

```typescript
import { Storage, Clipboard } from './app/utils/storage';

// Save data (works on mobile, web, desktop)
await Storage.setItemAsync('myKey', 'myValue');

// Get data
const value = await Storage.getItemAsync('myKey');

// Copy to clipboard
await Clipboard.setStringAsync('Copied text');
```

## Important Notes

### 🎥 Camera/QR Scanning
- **Works on:** Mobile (iOS/Android)
- **Desktop:** Manual code entry recommended

### 🔐 Storage Location
Data is stored securely at:
- macOS: `~/Library/Application Support/authenticator-data/`
- Windows: `%APPDATA%/authenticator-data/`
- Linux: `~/.config/authenticator-data/`

### 🚀 First Launch
On first run, the app will:
1. Generate encryption keys
2. Create secure storage
3. Be ready to add accounts

## Troubleshooting (Quick Fixes)

### "Cannot find module 'electron'"
```bash
npm install
```

### White screen on launch
```bash
# Try dev mode first
npm run electron:dev

# If that works, rebuild:
npm run export:web
npm run electron:build
```

### App won't open (macOS "damaged" error)
```bash
xattr -cr /path/to/Authenticator.app
```

### Storage not persisting
Check the data folder exists (see Storage Location above)

## Next Steps

1. ✅ **You're done!** The basic desktop app is ready.

2. **Optional improvements:**
   - Add QR code file upload for desktop
   - Implement keyboard shortcuts
   - Add system tray icon
   - Enable auto-updates

   See `ELECTRON_README.md` for details.

3. **Migrate existing code:**
   Update your files to use the cross-platform storage adapter.
   See `MIGRATION_GUIDE.md` for step-by-step instructions.

## Testing

Before distributing your app:

```bash
# Test on macOS
npm run electron:build:mac
open dist/mac/Authenticator.app

# Test on Windows (from Windows machine)
npm run electron:build:win
./dist/win-unpacked/Authenticator.exe

# Test on Linux (from Linux machine)
npm run electron:build:linux
./dist/Authenticator-1.0.0.AppImage
```

## Distribution

Built files are in `dist/` folder:

| Platform | File | Type |
|----------|------|------|
| macOS | `Authenticator-1.0.0.dmg` | Installer |
| Windows | `Authenticator Setup 1.0.0.exe` | Installer |
| Linux | `Authenticator-1.0.0.AppImage` | Portable |

**Users can:**
1. Download the file
2. Double-click to install/run
3. Use your app like any native application

## Security

The app includes:
- ✅ Encrypted storage (electron-store with AES-256)
- ✅ Context isolation (no direct Node.js access)
- ✅ Sandboxed renderer process
- ✅ Secure IPC communication

For production, add:
- Code signing (required for macOS/Windows)
- Notarization (required for macOS)
- Update server (for auto-updates)

## More Info

- **Full documentation:** `ELECTRON_README.md`
- **Code migration:** `MIGRATION_GUIDE.md`
- **Electron docs:** https://electronjs.org
- **Build docs:** https://electron.build

---

**Ready to go!** Run `npm run electron:dev` to see your app on desktop.
