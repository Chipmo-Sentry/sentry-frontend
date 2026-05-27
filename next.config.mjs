/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Transpile the workspace ui-kit (file: dep) so Next can process its ESM
  transpilePackages: ["@chipmo-sentry/ui-kit"],
};

export default nextConfig;
