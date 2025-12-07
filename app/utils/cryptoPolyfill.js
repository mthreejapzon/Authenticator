/**
 * Cross-platform crypto random bytes generator
 * Handles mobile (expo-crypto), web, and Electron environments
 */

import { Platform } from "react-native";

/**
 * Generate cryptographically secure random bytes
 * @param length Number of bytes to generate
 * @returns {Uint8Array} of random bytes
 */
function getRandomBytes(length) {
  // Web and Electron: Use Web Crypto API
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.crypto && typeof window.crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(length);
      window.crypto.getRandomValues(bytes);
      return bytes;
    }

    // Fallback: Math.random (NOT cryptographically secure, but works)
    console.warn("Using Math.random fallback - not cryptographically secure!");
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
    return bytes;
  }

  // Mobile (iOS/Android): Use expo-crypto
  try {
    // Dynamic import to avoid bundling issues
    const ExpoCrypto = require("expo-crypto");
    if (ExpoCrypto && typeof ExpoCrypto.getRandomValues === 'function') {
      return ExpoCrypto.getRandomValues(new Uint8Array(length));
    }
  } catch (error) {
    // expo-crypto not available (expected on web/Electron)
    console.log("expo-crypto not available, this is expected on web/Electron");
  }

  // Last resort fallback for web if crypto API failed
  console.warn("Using Math.random fallback - not cryptographically secure!");
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

// Export both named and as a module that mimics expo-crypto API
export { getRandomBytes };

// Also export as default and with expo-crypto compatible API
export default {
  getRandomValues: getRandomBytes,
  getRandomBytes,
};

// For require() compatibility (when used as polyfill for expo-crypto)
module.exports = {
  getRandomValues: getRandomBytes,
  getRandomBytes,
};
