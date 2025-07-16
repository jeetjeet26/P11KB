/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Increase the body size limit for file uploads
    serverComponentsExternalPackages: ['pdf-parse'],
  },
  // Configure API routes to handle larger file uploads
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
}

module.exports = nextConfig 