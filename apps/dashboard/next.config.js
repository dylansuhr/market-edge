/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // Ensure @ alias resolves correctly
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': __dirname,
    }
    return config
  },
}

module.exports = nextConfig
