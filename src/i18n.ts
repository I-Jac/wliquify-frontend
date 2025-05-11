import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector'; // For language detection
import HttpApi from 'i18next-http-backend'; // Import the backend

// Remove the hardcoded resources object
// const resources = { ... }; 

i18n
  .use(HttpApi) // Use http backend to load translations
  .use(LanguageDetector) // Detect user language
  .use(initReactI18next) // Pass i18n down to react-i18next
  .init({
    // resources, // Remove this line
    fallbackLng: 'en', // Use English if detected language is not available
    debug: process.env.NODE_ENV === 'development', // Enable debug output in development
    ns: ['translation'], // Default namespace
    defaultNS: 'translation',
    interpolation: {
      escapeValue: false, // React already safes from xss
    },
    detection: {
      // Order and from where user language should be detected
      order: ['localStorage', 'navigator', 'htmlTag', 'path', 'subdomain'],
      // Keys or params to lookup language from
      lookupLocalStorage: 'i18nextLng', // Key in localStorage
      // Cache user language on
      caches: ['localStorage'],
      // Optional: cookieDomain: '.yourdomain.com' if using cookies cross-domain
    },
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json', // Path to translation files
    }
  });

export default i18n; 