import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector'; // For language detection
import HttpApi from 'i18next-http-backend'; // Import the http backend
// import ChainedBackend from 'i18next-chained-backend'; // ChainedBackend might be complex with async FSBackend
// Conditional import for FSBackend might be needed if Webpack struggles
// For now, let's rely on ChainedBackend's logic and proper Webpack config.
import type { InitOptions } from 'i18next';


// Remove the hardcoded resources object
// const resources = { ... }; 

const isBrowser = typeof window !== 'undefined';
const isDev = process.env.NODE_ENV === 'development';

// i18n
  // .use(ChainedBackend) // Temporarily remove ChainedBackend to simplify while debugging FSBackend
  // .use(initReactI18next); // initReactI18next should come after backends if LanguageDetector is not used first by ChainedBackend

// if (isBrowser) { // Only add LanguageDetector if in browser
//   i18n.use(LanguageDetector);
// }

const baseInitOptions: InitOptions = {
  fallbackLng: 'en', // Use English if detected language is not available
  debug: false, // Disable debug output in development to reduce console noise
  ns: ['translation'], // Default namespace
  defaultNS: 'translation',
  interpolation: {
    escapeValue: false, // React already safes from xss
  },
  react: {
    useSuspense: isDev, // Consider setting to false for production builds if issues persist
  }
};

// let i18nInstance = i18n.use(initReactI18next); // Moved inside async function

async function initializeI18next() {
  let i18nInstance = i18n.use(initReactI18next);

  if (isBrowser) {
    i18nInstance = i18nInstance
      .use(HttpApi) // HttpApi for browser
      .use(LanguageDetector);

    await i18nInstance.init({ // await the init
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
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const FSBackendPromise = require('i18next-fs-backend');
      const FSBackendModule = await FSBackendPromise; // Await the promise here

      if (typeof FSBackendModule === 'function') {
          ActualFSBackend = FSBackendModule;
      } else if (FSBackendModule && typeof FSBackendModule.default === 'function') {
          ActualFSBackend = FSBackendModule.default;
      } else if (FSBackendModule && typeof FSBackendModule.default !== 'undefined') { 
          ActualFSBackend = FSBackendModule.default;
          console.warn('FSBackendModule.default is not a function, using it directly.');
      } else {
          ActualFSBackend = FSBackendModule; 
          console.warn('FSBackendModule or FSBackendModule.default is not a function or resolvable. Using raw module.');
      }

    } catch (e) {
      console.error("Failed to load or resolve i18next-fs-backend for server-side rendering:", e);
    }

    if (ActualFSBackend) {
      try {
          i18nInstance = i18nInstance.use(ActualFSBackend);
      } catch (useError) {
          console.error("Error calling i18nInstance.use(ActualFSBackend):", useError);
          console.error("ActualFSBackend at time of .use() call:", ActualFSBackend);
      }
      await i18nInstance.init({ // await the init
        ...baseInitOptions,
        backend: { 
          loadPath: './public/locales/{{lng}}/{{ns}}.json',
          addPath: './public/locales/{{lng}}/{{ns}}.missing.json',
        },
      });
    } else {
      console.warn("i18next-fs-backend was not loaded or resolved correctly. Server-side translations might not work. Initializing with no backend for server.");
      await i18nInstance.init({ // await the init
        ...baseInitOptions,
        lng: 'en', // Specify a language
      });
    }
  }
  return i18nInstance;
}

export default initializeI18next(); 