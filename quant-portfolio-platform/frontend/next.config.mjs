/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  // The browser only ever talks to this origin: /api/* is proxied to FastAPI by the
  // route handler in app/api/[...path]/route.ts, so the session cookie is first-party
  // and no database or API secret reaches the browser. The proxy is a route handler
  // rather than a rewrite because Next bakes rewrite destinations into the build,
  // which would make API_URL a build-time variable instead of a runtime one.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
