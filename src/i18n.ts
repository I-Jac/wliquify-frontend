import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector'; // For language detection
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import HttpApi from 'i18next-http-backend'; // Import the http backend
import ChainedBackend from 'i18next-chained-backend';
// Conditional import for FSBackend might be needed if Webpack struggles
// For now, let's rely on ChainedBackend's logic and proper Webpack config.

// Remove the hardcoded resources object
// const resources = { ... }; 

const isBrowser = typeof window !== 'undefined';
const isDev = process.env.NODE_ENV === 'development';

i18n
  .use(ChainedBackend) // Use ChainedBackend
  .use(initReactI18next); // initReactI18next should come after backends if LanguageDetector is not used first by ChainedBackend

if (isBrowser) { // Only add LanguageDetector if in browser
  i18n.use(LanguageDetector);
}

const baseInitOptions = {
  fallbackLng: 'en', // Use English if detected language is not available
  debug: isDev, // Enable debug output in development
  ns: ['translation'], // Default namespace
  defaultNS: 'translation',
  interpolation: {
    escapeValue: false, // React already safes from xss
  },
  react: {
    useSuspense: isDev, // Consider setting to false for production builds if issues persist
  }
};

let i18nInstance = i18n.use(initReactI18next);

if (isBrowser) {
  i18nInstance = i18nInstance
    .use(HttpApi)
    .use(LanguageDetector);

  i18nInstance.init({
    ...baseInitOptions,
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json', 
    },
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag', 'path', 'subdomain'],
      lookupLocalStorage: 'i18nextLng',
      caches: ['localStorage'],
    },
  });
} else {
  // Server-side (Node.js) configuration
  let ActualFSBackend;
  try {
    const fsBackendPath = require.resolve('i18next-fs-backend/cjs/index.js');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const FSBackendModule = require(fsBackendPath); // This require uses a variable, so it needs the disable.
    ActualFSBackend = FSBackendModule.default || FSBackendModule;
  } catch (e) {
    console.error("Failed to load i18next-fs-backend for server-side rendering:", e);
  }

  if (ActualFSBackend) {
    i18nInstance = i18nInstance.use(ActualFSBackend);
    i18nInstance.init({
      ...baseInitOptions,
      backend: { 
        loadPath: './public/locales/{{lng}}/{{ns}}.json',
        addPath: './public/locales/{{lng}}/{{ns}}.missing.json',
      },
    });
  } else {
    console.warn("i18next-fs-backend was not loaded. Server-side translations might not work. Initializing with no backend for server.");
    i18nInstance.init({ // Initialize with no backend if FSBackend failed
      ...baseInitOptions,
      lng: 'en', // Specify a language
    });
  }
}

export default i18nInstance; 