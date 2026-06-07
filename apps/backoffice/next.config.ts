import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Shared workspace package shipping raw TS/TSX — Next must transpile it.
  transpilePackages: ['@break-eat/brand'],
  // NEXT_PUBLIC_API_URL must be set at build time (or via env at runtime).
  // Default: http://localhost:3000/api/v1 for local development.
  // On Vercel: set NEXT_PUBLIC_API_URL=https://your-railway-backend/api/v1
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1',
  },
};

export default nextConfig;
