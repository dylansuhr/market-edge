const path = require('path')
const fs = require('fs')

function resolveAliasRoot() {
  const candidates = [
    path.resolve(__dirname),
    path.resolve(__dirname, 'apps/dashboard'),
    path.resolve(process.cwd(), 'apps/dashboard')
  ]
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'lib'))) {
      return dir
    }
  }
  return path.resolve(__dirname)
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack(config) {
    if (!config.resolve) {
      config.resolve = {}
    }
    if (!config.resolve.alias) {
      config.resolve.alias = {}
    }
    const aliasRoot = resolveAliasRoot()
    config.resolve.alias['@'] = aliasRoot
    if (process.env.VERCEL) {
      console.log('next.config.js __dirname:', __dirname)
      console.log('next.config.js process.cwd():', process.cwd())
      console.log('Resolved @ alias root:', aliasRoot)
    }
    return config
  }
}

module.exports = nextConfig
