/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Self-contained server bundle for Docker / Railway — keeps the runtime
  // image small (~100 MB) and avoids carrying node_modules at runtime.
  output: "standalone",
  // Transpile the workspace ui-kit (file: dep) so Next can process its ESM
  transpilePackages: ["@chipmo-sentry/ui-kit"],
};

export default nextConfig;
