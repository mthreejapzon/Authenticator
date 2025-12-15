// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Add resolver configuration to handle Node.js modules on web
config.resolver = config.resolver || {};

// Blacklist the electron folder to prevent it from being bundled for web
config.resolver.blockList = [
  ...(config.resolver.blockList || []),
  /electron\/.*/,
];

// Provide empty modules for Node.js-specific packages on web
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  'expo-crypto': require.resolve('./app/utils/cryptoPolyfill.ts'),
};

// Add custom resolver
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Redirect expo-crypto to our polyfill on web
  if (platform === 'web' && moduleName === 'expo-crypto') {
    return context.resolveRequest(
      context,
      './app/utils/cryptoPolyfill.ts',
      platform
    );
  }

  // Use default resolution
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
