// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Ensure resolver exists
config.resolver = config.resolver || {};

// Ignore the Electron folder so Metro doesn't try to bundle it
config.resolver.blockList = [
  /electron\/.*/,
  ...(config.resolver.blockList || [])
];

// Redirect expo-crypto → polyfill ON WEB ONLY
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  'expo-crypto': require.resolve('./app/utils/cryptoPolyfill.ts'),
};

module.exports = config;
