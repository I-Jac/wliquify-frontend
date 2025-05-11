/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Don't include fs module on client-side
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
      };
      // Restore: Alias i18next-fs-backend to false for client-side builds
      config.resolve.alias = {
        ...config.resolve.alias,
        'i18next-fs-backend': false,
      };
    }
    return config;
  },
};

export default nextConfig; 