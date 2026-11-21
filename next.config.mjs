/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3 is a native module: keep it out of the bundle.
  serverExternalPackages: ['better-sqlite3'],
  // Mock references can be files up to 10 MB (REQ-010); leave room for the rest of the form.
  experimental: { serverActions: { bodySizeLimit: '11mb' } },
};

export default nextConfig;
