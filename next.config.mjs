/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Self-contained server bundle for Docker / Railway — keeps the runtime
  // image small (~100 MB) and avoids carrying node_modules at runtime.
  output: "standalone",
  // Transpile the workspace ui-kit (file: dep) so Next can process its ESM
  transpilePackages: ["@chipmo-sentry/ui-kit"],
  // Same-origin API proxy. The browser only ever talks to THIS origin
  // (NEXT_PUBLIC_API_BASE_URL=""), and Next forwards /api/* to the backend
  // server-side. This makes the auth cookie same-origin (host-only) so
  // SameSite=Lax + the middleware gate work without any custom domain — the
  // backend cross-site cookie problem disappears. BACKEND_ORIGIN is a
  // build/runtime server env (NOT NEXT_PUBLIC).
  async rewrites() {
    const backend = process.env.BACKEND_ORIGIN ?? "http://localhost:8000";
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
};

export default nextConfig;
