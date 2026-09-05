/** @type {import('next').NextConfig} */

// The backend (../backend) is a separate Python process with its own API on
// its own port. Rewriting `/api/*` here means every fetch in this app can
// stay a plain relative `fetch("/api/feed")` -- no base URL, no CORS, and
// the browser only ever talks to this Next.js origin. Override
// BACKEND_URL if the backend isn't on the default port/host.
const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8765";

const nextConfig = {
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${BACKEND_URL}/api/:path*` }];
  },
};

export default nextConfig;
