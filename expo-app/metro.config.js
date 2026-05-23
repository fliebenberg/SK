const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// Surgical fallback for Zustand ESM Metro bundler crash on Web.
// Force resolving Zustand to CommonJS (CJS) to avoid browser-specific 'import.meta' syntax.
// TODO: Remove this resolveRequest custom hook once upgrading to an Expo SDK / Hermes version 
// with native support for ESM 'import.meta' (e.g. SDK 56+).
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "zustand" || moduleName.startsWith("zustand/")) {
    return {
      type: "sourceFile",
      filePath: require.resolve(moduleName),
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: "./global.css" });
