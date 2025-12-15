# Migration Guide: Making Your Code Desktop-Compatible

This guide will help you update your existing Authenticator app code to work seamlessly across mobile, web, and desktop (Electron) platforms.

## Quick Summary

You need to replace direct Expo module imports with the cross-platform adapters in these files:

### Files That Need Updates

1. `app/details/[key].tsx` - Update clipboard usage
2. `app/components/AccountForm.tsx` - Update clipboard usage
3. `app/settings.tsx` - Update SecureStore and clipboard usage
4. Any other files using `expo-secure-store` or `expo-clipboard`

## Step-by-Step Migration

### 1. Replace SecureStore Imports

#### Find all instances:
```bash
grep -r "expo-secure-store" app/
```

#### Replace pattern:

**Before:**
```typescript
import * as SecureStore from 'expo-secure-store';

// Usage
await SecureStore.getItemAsync('key');
await SecureStore.setItemAsync('key', 'value');
await SecureStore.deleteItemAsync('key');
```

**After:**
```typescript
import { Storage } from './utils/storage';  // Adjust path as needed

// Usage (API is identical)
await Storage.getItemAsync('key');
await Storage.setItemAsync('key', 'value');
await Storage.deleteItemAsync('key');
```

### 2. Replace Clipboard Imports

#### Find all instances:
```bash
grep -r "expo-clipboard" app/
```

#### Replace pattern:

**Before:**
```typescript
import * as ExpoClipboard from 'expo-clipboard';

await ExpoClipboard.setStringAsync(text);
```

**After:**
```typescript
import { Clipboard } from './utils/storage';  // Adjust path as needed

await Clipboard.setStringAsync(text);
```

### 3. Update Camera/QR Scanning (Optional)

The camera functionality in `app/add-qr.tsx` will work on mobile but needs a fallback for desktop.

#### Recommended approach:

```typescript
import { PlatformUtils } from './utils/storage';
import { CameraView } from 'expo-camera';

function AddQRScreen() {
  if (PlatformUtils.isElectron) {
    return (
      <View>
        <Text>Desktop QR scanning coming soon</Text>
        <Button
          title="Use Manual Entry Instead"
          onPress={() => router.push('/add-code')}
        />
      </View>
    );
  }

  // Existing mobile camera implementation
  return (
    <CameraView onBarcodeScanned={handleBarCodeScanned}>
      {/* ... */}
    </CameraView>
  );
}
```

## Specific File Updates

### File: `app/details/[key].tsx`

Find this code (around line 200-250):
```typescript
import * as Clipboard from 'expo-clipboard';
```

Replace with:
```typescript
import { Clipboard } from '../utils/storage';
```

### File: `app/components/AccountForm.tsx`

Find clipboard imports and replace similarly:
```typescript
import { Clipboard } from '../utils/storage';
```

### File: `app/settings.tsx`

This file likely uses both SecureStore and Clipboard:

**Find:**
```typescript
import * as SecureStore from 'expo-secure-store';
import * as Clipboard from 'expo-clipboard';
```

**Replace with:**
```typescript
import { Storage, Clipboard } from '../utils/storage';
```

**Then update all usage:**
```typescript
// Old
await SecureStore.getItemAsync('github_token');
await SecureStore.setItemAsync('github_token', token);

// New
await Storage.getItemAsync('github_token');
await Storage.setItemAsync('github_token', token);
```

## Verification Steps

After making changes, verify everything works:

### 1. Test on Web
```bash
npm run web
```
Check that all storage and clipboard operations work in browser.

### 2. Test on Electron
```bash
npm run electron:dev
```
Verify:
- [ ] Accounts can be added
- [ ] OTP codes generate correctly
- [ ] Copy to clipboard works
- [ ] Data persists after app restart
- [ ] Backup/restore functionality works

### 3. Test on Mobile (iOS/Android)
```bash
npm run ios
# or
npm run android
```
Ensure mobile functionality is not broken.

## Common Issues & Solutions

### Issue: Import path errors

**Problem:**
```
Cannot find module '../utils/storage'
```

**Solution:**
Adjust the relative path based on file location:
- From `app/details/[key].tsx` → `import { Storage } from '../utils/storage'`
- From `app/components/AccountForm.tsx` → `import { Storage } from '../utils/storage'`
- From `app/settings.tsx` → `import { Storage } from './utils/storage'`

### Issue: "localStorage is not defined" on mobile

**Problem:**
The storage adapter tries to use localStorage on mobile.

**Solution:**
This shouldn't happen due to platform detection, but if it does:
```typescript
// In app/utils/storage.ts
if (Platform.OS === 'web') {
  // Add additional check
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem(key);
  }
}
```

### Issue: TypeScript errors about window.electronAPI

**Problem:**
```
Property 'electronAPI' does not exist on type 'Window'
```

**Solution:**
Already handled in `app/utils/storage.ts` with global type declaration. If you see this elsewhere, add:
```typescript
declare global {
  interface Window {
    electronAPI?: any;
  }
}
```

## Automated Migration Script

Here's a script to help automate some replacements:

```bash
#!/bin/bash
# save as migrate.sh and run: chmod +x migrate.sh && ./migrate.sh

echo "Starting migration..."

# Find and list files that need updates
echo "Files using expo-secure-store:"
grep -l "expo-secure-store" app/**/*.{ts,tsx} 2>/dev/null

echo ""
echo "Files using expo-clipboard:"
grep -l "expo-clipboard" app/**/*.{ts,tsx} 2>/dev/null

echo ""
echo "Please update these files manually following the migration guide."
echo "Automated replacement can cause issues - manual review is recommended."
```

## Testing Checklist

After migration, test each feature:

### Storage Operations
- [ ] Add new account
- [ ] Edit existing account
- [ ] Delete account
- [ ] Restart app and verify data persists

### Clipboard Operations
- [ ] Copy OTP code
- [ ] Copy username
- [ ] Copy password
- [ ] Verify paste works in other apps

### Platform-Specific
- [ ] Camera works on mobile (iOS/Android)
- [ ] QR scanning works on mobile
- [ ] Desktop shows appropriate fallbacks
- [ ] Web version works in browser

### Backup/Restore
- [ ] Create GitHub backup
- [ ] Restore from backup
- [ ] Verify encryption works

## Rollback Plan

If you encounter issues, you can temporarily rollback:

1. Keep the old imports alongside new ones:
```typescript
import * as SecureStore from 'expo-secure-store';
import { Storage } from './utils/storage';

// Use conditional logic
const value = Platform.OS === 'web'
  ? await Storage.getItemAsync(key)
  : await SecureStore.getItemAsync(key);
```

2. Or revert package.json main entry:
```json
"main": "expo-router/entry"  // Instead of "electron/main.js"
```

## Need Help?

If you encounter issues during migration:

1. Check the console for error messages
2. Verify import paths are correct
3. Ensure all dependencies are installed (`npm install`)
4. Test on one platform at a time
5. Check ELECTRON_README.md for troubleshooting

## Post-Migration Optimization

After successful migration, consider:

1. **Remove unused imports**
   - Clean up any old expo-secure-store imports
   - Remove expo-clipboard if fully replaced

2. **Add platform-specific features**
   - Desktop: keyboard shortcuts, menu bar
   - Mobile: haptic feedback, gestures
   - Web: PWA support, service workers

3. **Update tests**
   - Mock the Storage adapter in tests
   - Test cross-platform scenarios

---

**Remember:** Always test on all target platforms after migration!
