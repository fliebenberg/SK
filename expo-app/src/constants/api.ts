import Constants from 'expo-constants';
import { Platform } from 'react-native';

const getApiUrl = () => {
  // If running in production or specific env, you can define the URL here.
  // Otherwise, use dynamic IP detection for Expo Go / Native testing.
  if (Platform.OS === 'web') {
    return 'http://localhost:3001';
  }
  
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const ip = hostUri.split(':')[0];
    return `http://${ip}:3001`;
  }
  
  // Fallback for iOS Simulator or other environments
  return 'http://127.0.0.1:3001';
};

export const API_URL = getApiUrl();
console.log('[API_URL Resolved]:', API_URL);
