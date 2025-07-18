/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Increase the body size limit for file uploads
    serverComponentsExternalPackages: ['pdf-parse'],
  },
}

module.exports = nextConfig 