import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@openlintel/core', '@openlintel/ui', '@openlintel/db', '@openlintel/config'],
};

export default nextConfig;
