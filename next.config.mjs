/** @type {import('next').NextConfig} */
const nextConfig = {
  // Mock references are files up to 10 MB, and a mock set up to 50 MB (REQ-010); leave room for the rest of the form.
  experimental: { serverActions: { bodySizeLimit: '52mb' } },
};

export default nextConfig;
