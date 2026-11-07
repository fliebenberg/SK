module.exports = ({ config }) => {
  return {
    ...config,
    // A deploy builds the web app as one page (EXPO_WEB_OUTPUT=single): a plain web server can then
    // answer every address with index.html. The default "static" output writes a file per route,
    // named after its parameters (organizations/[orgId].html), which only Expo's own server maps.
    // See docs/deployment.md.
    web: {
      ...config.web,
      output: process.env.EXPO_WEB_OUTPUT || config.web?.output,
    },
    android: {
      ...config.android,
      config: {
        ...config.android?.config,
        googleMaps: {
          apiKey: process.env.EXPO_PUBLIC_ANDROID_GOOGLE_MAPS_API_KEY
        }
      }
    }
  };
};
