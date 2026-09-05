/** @type {import('next').NextConfig} */

// The backend (../backend) is a separate Python process with its own API on
// its own port. Rewriting `/api/*` here means every fetch in this app can
// stay a plain relative `fetch("/api/feed")` -- no base URL, no CORS, and
// the browser only ever talks to this Next.js origin. Override
// BACKEND_URL if the backend isn't on the default port/host.
const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8765";

// The scraper is a process on someone's machine, not a hosted service, so on
// a deployed frontend there is nothing at 127.0.0.1 to rewrite to. Adding the
// rule anyway would turn the Refresh button into a confusing gateway error;
// without it the request 404s, postPoll() returns false, and the board says
// it could not reach the poller -- which is exactly what happened.
const PROXY_BACKEND = !!process.env.BACKEND_URL || process.env.NODE_ENV === "development";

const nextConfig = {
  async rewrites() {
    if (!PROXY_BACKEND) return [];
    return [{ source: "/api/:path*", destination: `${BACKEND_URL}/api/:path*` }];
  },
};

export default nextConfig;
