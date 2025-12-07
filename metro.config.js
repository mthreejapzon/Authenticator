// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');
const exclusionList = require('metro-config/src/defaults/exclusionList');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Ensure resolver exists
config.resolver = config.resolver || {};

// Ignore the Electron folder so Metro doesn’t try to bundle it
config.resolver.blacklistRE = exclusionList([
  /electron\/.*/
]);

// Redirect expo-crypto → polyfill ON WEB ONLY
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  'expo-crypto': require.resolve('./app/utils/cryptoPolyfill.js'),
};

module.exports = config;
