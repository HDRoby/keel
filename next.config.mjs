/** @type {import('next').NextConfig} */
const nextConfig = {
  // A self-contained server in .next/standalone, so the published package runs without a build (ADR-0016).
  output: 'standalone',
  // Trace from this folder, not from a lockfile in a parent folder.
  outputFileTracingRoot: import.meta.dirname,
  // Keel's seed library is read at run time, so it travels with the server.
  outputFileTracingIncludes: { '*': ['./seed/**/*'] },
  // No native modules in the package (sharp is not used; see images below).
  outputFileTracingExcludes: { '*': ['./node_modules/{sharp,@img}/**/*'] },
  // A local tool showing one logo: no image optimisation, so no native image library.
  images: { unoptimized: true },
  // Mock references are files up to 10 MB, and a mock set up to 50 MB (REQ-010); leave room for the rest of the form.
  experimental: { serverActions: { bodySizeLimit: '52mb' } },
};

export default nextConfig;
