import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Required by the Dockerfile prod stage (runs .next/standalone/server.js).
  output: 'standalone',
}

export default nextConfig
