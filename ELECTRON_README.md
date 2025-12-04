# Authenticator - Desktop (Electron) Version

Your Authenticator app has been successfully configured to run as a desktop application using Electron!

## Overview

This implementation allows your Expo/React Native authenticator app to run as a native desktop application on macOS, Windows, and Linux. The app maintains all core functionality while adapting to desktop-specific features.

## What Was Implemented

### 1. **Electron Integration**
   - Main process (`electron/main.js`) - Handles window management and system APIs
   - Preload script (`electron/preload.js`) - Secure bridge between renderer and main process
   - IPC handlers for secure storage and clipboard operations

### 2. **Cross-Platform Storage Adapter** (`app/utils/storage.ts`)
   - Unified API that works across mobile (expo-secure-store), web (localStorage), and desktop (electron-store)
   - Automatic platform detection
   - Seamless fallback mechanism

### 3. **Security Features**
   - Context isolation enabled
   - Sandboxed renderer process
   - Encrypted storage using electron-store
   - No direct Node.js access from renderer

### 4. **Build Configuration**
   - electron-builder setup for creating installers
   - Supports macOS (.dmg, .zip), Windows (.exe, portable), and Linux (.AppImage, .deb)

## Installation & Setup

### Prerequisites
- Node.js >= 20.19.4
- npm >= 10.5.2

All Electron dependencies are already installed via:
- `electron` - Main framework
- `electron-builder` - Build and packaging
- `electron-store` - Secure encrypted storage
- `concurrently` - Run multiple commands
- `wait-on` - Wait for server startup

## Running the Desktop App

### Development Mode

```bash
npm run electron:dev
```

This will:
1. Start the Expo web server on port 8081
2. Launch Electron pointing to the dev server
3. Enable hot-reload for rapid development
4. Open DevTools automatically

### Building for Production

#### Build for all platforms:
```bash
npm run electron:build
```

#### Build for specific platforms:
```bash
# macOS only
npm run electron:build:mac

# Windows only
npm run electron:build:win

# Linux only
npm run electron:build:linux
```

Built applications will be in the `dist/` directory.

## Platform-Specific Features

### Desktop Advantages
✅ **Native Window Controls** - Standard minimize, maximize, close buttons
✅ **System Tray Integration** - Can be extended for background operation
✅ **Local Encrypted Storage** - More secure than browser localStorage
✅ **No Browser Security Restrictions** - Full clipboard access
✅ **Offline-First** - Works without internet connection
✅ **Auto-Updates** - Can implement electron-updater for seamless updates

### Desktop Limitations
⚠️ **QR Code Scanning** - Camera access requires user permission
⚠️ **Haptic Feedback** - Not available on desktop
⚠️ **Mobile Gestures** - Swipe actions adapted to click/drag

## Adapting Your Code

### Using the Storage Adapter

Replace all instances of direct `expo-secure-store` imports with the unified storage adapter:

**Before:**
```typescript
import * as SecureStore from 'expo-secure-store';

await SecureStore.setItemAsync('key', 'value');
const value = await SecureStore.getItemAsync('key');
```

**After:**
```typescript
import { Storage } from './utils/storage';

await Storage.setItemAsync('key', 'value');
const value = await Storage.getItemAsync('key');
```

### Using the Clipboard Adapter

**Before:**
```typescript
import * as ExpoClipboard from 'expo-clipboard';

await ExpoClipboard.setStringAsync('text');
```

**After:**
```typescript
import { Clipboard } from './utils/storage';

await Clipboard.setStringAsync('text');
```

### Platform Detection

```typescript
import { PlatformUtils } from './utils/storage';

if (PlatformUtils.isElectron) {
  // Desktop-specific code
}

if (PlatformUtils.isMobile) {
  // Mobile-specific code
}

if (PlatformUtils.isWeb) {
  // Web-specific code
}
```

## QR Code Scanning on Desktop

The `expo-camera` module has limited support on desktop. Consider these approaches:

### Option 1: File Upload (Recommended)
Allow users to upload QR code images and process them with a library like `jsqr`:

```bash
npm install jsqr
```

### Option 2: Webcam Access
Use browser WebRTC APIs to access the webcam:

```typescript
if (PlatformUtils.isElectron || PlatformUtils.isWeb) {
  // Use HTML5 video + canvas for webcam access
  const video = document.createElement('video');
  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
  video.srcObject = stream;
}
```

### Option 3: Manual Entry
Emphasize the manual code entry feature (already implemented in `add-code.tsx`).

## File Structure

```
Authenticator/
├── electron/
│   ├── main.js          # Electron main process
│   └── preload.js       # Secure preload script
├── app/
│   └── utils/
│       └── storage.ts   # Cross-platform storage adapter
├── dist/                # Built app output (after build)
├── package.json         # Updated with Electron scripts
└── ELECTRON_README.md   # This file
```

## Troubleshooting

### Issue: "Cannot find module 'electron'"
**Solution:** Run `npm install` to ensure all dependencies are installed.

### Issue: Blank white screen on launch
**Solution:**
1. Check console for errors with DevTools (enable in main.js)
2. Verify `dist/` folder exists after running `npm run export:web`
3. Try `npm run electron:dev` to debug with hot-reload

### Issue: Storage not persisting
**Solution:** electron-store data is stored at:
- macOS: `~/Library/Application Support/authenticator-data/`
- Windows: `%APPDATA%/authenticator-data/`
- Linux: `~/.config/authenticator-data/`

### Issue: "App is damaged and can't be opened" (macOS)
**Solution:** The app needs to be code-signed. For development:
```bash
xattr -cr /path/to/Authenticator.app
```

## Next Steps

### Recommended Enhancements

1. **Add QR Code Scanner Polyfill**
   - Implement file upload QR scanning
   - Add webcam scanning fallback

2. **Implement Auto-Updates**
   ```bash
   npm install electron-updater
   ```

3. **Add Menu Bar**
   - Create application menu with shortcuts
   - Add Edit → Copy/Paste menu items

4. **System Tray Icon**
   - Add tray icon for quick access
   - Implement "click to show" functionality

5. **Native Notifications**
   - Alert when OTP is about to expire
   - Notify on successful backup

6. **Keyboard Shortcuts**
   - Cmd/Ctrl + N: New account
   - Cmd/Ctrl + C: Copy OTP
   - Cmd/Ctrl + B: Backup now

## Security Considerations

### Encryption
- electron-store uses AES-256 encryption
- Encryption key is stored in `electron/main.js` (should be user-specific in production)
- Consider implementing master password for additional security

### Sandboxing
- Renderer process is sandboxed (no direct Node.js access)
- All system APIs go through IPC handlers
- Context isolation prevents prototype pollution

### Recommendations for Production
1. Implement code signing for all platforms
2. Use environment-specific encryption keys
3. Enable Content Security Policy (CSP)
4. Implement auto-updates with signature verification
5. Add rate limiting to IPC handlers

## Testing

### Manual Testing Checklist
- [ ] App launches successfully
- [ ] Can add accounts (manual entry)
- [ ] OTP generation works
- [ ] Accounts persist after restart
- [ ] Clipboard copy works
- [ ] Backup/restore functionality
- [ ] Window resize and minimize
- [ ] DevTools accessible (dev mode)

### Cross-Platform Testing
Test on all target platforms before release:
- [ ] macOS 10.15+
- [ ] Windows 10/11
- [ ] Ubuntu 20.04+

## Building for Distribution

### Code Signing

**macOS:**
```bash
# Requires Apple Developer account
export CSC_NAME="Developer ID Application: Your Name (TEAM_ID)"
npm run electron:build:mac
```

**Windows:**
```bash
# Requires code signing certificate
export CSC_LINK=/path/to/certificate.pfx
export CSC_KEY_PASSWORD=your_password
npm run electron:build:win
```

### App Notarization (macOS)

After signing, notarize for Gatekeeper:
```bash
npx electron-notarize --app-path "dist/mac/Authenticator.app"
```

## Support & Resources

- [Electron Documentation](https://www.electronjs.org/docs)
- [electron-builder Guide](https://www.electron.build)
- [Expo Web Support](https://docs.expo.dev/workflow/web/)

## License

Same as the main project.

---

**Version:** 1.0.0
**Last Updated:** 2025-12-04
