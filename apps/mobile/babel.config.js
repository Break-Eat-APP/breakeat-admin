// babel-preset-expo étend @react-native/babel-preset → compatible Expo Go (preview)
// ET build natif. Requis pour que `expo start` transforme correctement le bundle.
module.exports = {
  presets: ['babel-preset-expo'],
};
