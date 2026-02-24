import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@openlintel/core', '@openlintel/ui', '@openlintel/db', '@openlintel/config'],
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
