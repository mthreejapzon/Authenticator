/**
 * Storage adapter that works across Expo (mobile), Web, and Electron
 * Provides a unified interface for secure storage operations
 */

import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import {
  CLIPBOARD_CLEAR_DELAY_DEFAULT_MS,
  CLIPBOARD_CLEAR_DELAY_KEY,
} from './constants';

// Type definitions for Electron API
interface ElectronAPI {
  secureStore: {
    getItemAsync: (key: string) => Promise<string | null>;
    setItemAsync: (key: string, value: string) => Promise<boolean>;
    deleteItemAsync: (key: string) => Promise<boolean>;
  };
  clipboard: {
    setStringAsync: (text: string) => Promise<boolean>;
    getStringAsync: () => Promise<string>;
  };
  isElectron: boolean;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

// Check if running in Electron
const isElectron = () => {
  if (Platform.OS === 'web') {
    return typeof window !== 'undefined' && window.electronAPI?.isElectron === true;
  }
  return false;
};

/**
 * Unified Storage API
 */
export const Storage = {
  /**
   * Get an item from secure storage
   */
  async getItemAsync(key: string): Promise<string | null> {
    try {
      if (isElectron() && window.electronAPI) {
        return await window.electronAPI.secureStore.getItemAsync(key);
      } else if (Platform.OS === 'web') {
        // Fallback to localStorage on web (non-Electron)
        return localStorage.getItem(key);
      } else {
        // Native mobile (iOS/Android)
        return await SecureStore.getItemAsync(key);
      }
    } catch (error) {
      console.error('Storage.getItemAsync error:', error);
      return null;
    }
  },

  /**
   * Set an item in secure storage
   */
  async setItemAsync(key: string, value: string): Promise<void> {
    try {
      if (isElectron() && window.electronAPI) {
        await window.electronAPI.secureStore.setItemAsync(key, value);
      } else if (Platform.OS === 'web') {
        // Fallback to localStorage on web (non-Electron)
        localStorage.setItem(key, value);
      } else {
        // Native mobile (iOS/Android)
        await SecureStore.setItemAsync(key, value);
      }
    } catch (error) {
      console.error('Storage.setItemAsync error:', error);
      throw error;
    }
  },

  /**
   * Delete an item from secure storage
   */
  async deleteItemAsync(key: string): Promise<void> {
    try {
      if (isElectron() && window.electronAPI) {
        await window.electronAPI.secureStore.deleteItemAsync(key);
      } else if (Platform.OS === 'web') {
        // Fallback to localStorage on web (non-Electron)
        localStorage.removeItem(key);
      } else {
        // Native mobile (iOS/Android)
        await SecureStore.deleteItemAsync(key);
      }
    } catch (error) {
      console.error('Storage.deleteItemAsync error:', error);
      throw error;
    }
  },
};

// ── Clipboard auto-clear ─────────────────────────────────────────────────────
// We keep a single module-level timer handle so that rapid copies always
// reset the countdown instead of stacking multiple timers.
let _autoClearTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Read the user's configured clipboard auto-clear delay from storage.
 * Returns 0 if the feature is disabled.
 */
async function getClipboardClearDelayMs(): Promise<number> {
  try {
    const raw = await Storage.getItemAsync(CLIPBOARD_CLEAR_DELAY_KEY);
    if (raw === null) return CLIPBOARD_CLEAR_DELAY_DEFAULT_MS; // first-run default
    const parsed = parseInt(raw, 10);
    return isNaN(parsed) ? CLIPBOARD_CLEAR_DELAY_DEFAULT_MS : parsed;
  } catch {
    return CLIPBOARD_CLEAR_DELAY_DEFAULT_MS;
  }
}

/**
 * Overwrite the clipboard with an empty string using the platform-appropriate API.
 */
async function clearClipboardContents(): Promise<void> {
  try {
    if (isElectron() && window.electronAPI) {
      await window.electronAPI.clipboard.setStringAsync('');
    } else if (Platform.OS === 'web') {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText('');
      }
    } else {
      const ExpoClipboard = require('expo-clipboard');
      await ExpoClipboard.setStringAsync('');
    }
    console.log('🗑️ Clipboard auto-cleared');
  } catch (err) {
    console.warn('Clipboard auto-clear failed:', err);
  }
}

/**
 * Unified Clipboard API
 */
export const Clipboard = {
  /**
   * Set string to clipboard.
   * Automatically schedules a clear after the user-configured delay
   * (default 30 s). If the delay is set to 0 the auto-clear is skipped.
   */
  async setStringAsync(text: string): Promise<void> {
    try {
      if (isElectron() && window.electronAPI) {
        await window.electronAPI.clipboard.setStringAsync(text);
      } else if (Platform.OS === 'web') {
        // Use web Clipboard API
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(text);
        } else {
          // Fallback for older browsers
          const textarea = document.createElement('textarea');
          textarea.value = text;
          textarea.style.position = 'fixed';
          textarea.style.opacity = '0';
          document.body.appendChild(textarea);
          try {
            textarea.select();
            // `document.execCommand('copy')` is deprecated in TypeScript lib.dom,
            // but it can still work in older browsers that lack `navigator.clipboard`.
            // Cast to `any` to avoid the deprecation diagnostic while preserving behavior.
            (document as any).execCommand?.('copy');
          } finally {
            document.body.removeChild(textarea);
          }
        }
      } else {
        // Native mobile - import dynamically to avoid bundling issues
        const ExpoClipboard = require('expo-clipboard');
        await ExpoClipboard.setStringAsync(text);
      }
    } catch (error) {
      console.error('Clipboard.setStringAsync error:', error);
      throw error;
    }

    // ── Auto-clear ──────────────────────────────────────────────────────────
    // Fire-and-forget: read the setting then arm (or re-arm) the timer.
    getClipboardClearDelayMs().then((delayMs) => {
      if (delayMs <= 0) return; // feature disabled

      if (_autoClearTimer !== null) {
        clearTimeout(_autoClearTimer);
      }

      _autoClearTimer = setTimeout(() => {
        _autoClearTimer = null;
        clearClipboardContents();
      }, delayMs);
    });
  },

  /**
   * Get string from clipboard
   */
  async getStringAsync(): Promise<string> {
    try {
      if (isElectron() && window.electronAPI) {
        return await window.electronAPI.clipboard.getStringAsync();
      } else if (Platform.OS === 'web') {
        // Use web Clipboard API
        if (navigator.clipboard) {
          return await navigator.clipboard.readText();
        }
        return '';
      } else {
        // Native mobile
        const ExpoClipboard = require('expo-clipboard');
        return await ExpoClipboard.getStringAsync();
      }
    } catch (error) {
      console.error('Clipboard.getStringAsync error:', error);
      return '';
    }
  },
};

/**
 * Platform detection utilities
 */
export const PlatformUtils = {
  isElectron: isElectron(),
  isWeb: Platform.OS === 'web',
  isMobile: Platform.OS === 'ios' || Platform.OS === 'android',
  platform: Platform.OS,
};
