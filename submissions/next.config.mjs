/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fail the production build on type errors rather than shipping them.
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: true },
  // Keep the client bundle small: nothing here needs the image optimizer or
  // source maps in production.
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
  // This app has its own lockfile inside a repo that has another one; tell Next
  // which root to trace so it stops warning about the ambiguity.
  outputFileTracingRoot: import.meta.dirname,
};

export default nextConfig;
