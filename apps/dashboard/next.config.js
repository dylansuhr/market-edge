const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack(config) {
    if (!config.resolve) {
      config.resolve = {}
    }
    if (!config.resolve.alias) {
      config.resolve.alias = {}
    }
    config.resolve.alias['@'] = path.resolve(__dirname)
    if (process.env.VERCEL) {
      console.log('Configured @ alias for Vercel build:', config.resolve.alias['@'])
    }
    return config
  }
}

module.exports = nextConfig
