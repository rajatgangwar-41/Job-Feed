import { auth } from "@clerk/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import Dashboard from "@/components/Dashboard";
import { OPS_PATH } from "@/lib/ops";

// Protected by src/middleware.js; the Convex queries underneath refuse to
// answer without a Clerk identity regardless.
//
// The operator link is decided here rather than in the client Header for the
// same reason the operator page itself is server-rendered: a path written
// into a client component is a string in a public /_next/static chunk. As a
// prop it exists only in this response, only for an account the allowlist
// accepts. Everybody else's Dashboard receives null and renders no link --
// there is nothing in their HTML or their JavaScript to find.
export const metadata = { title: "Board · Job Watch" };

export default async function Page() {
  let opsHref = null;
  try {
    const { getToken } = await auth();
    const token = await getToken({ template: "convex" });
    if (token && await fetchQuery(api.admin.isAdmin, {}, { token })) opsHref = OPS_PATH;
  } catch {
    // Never let this decide whether the board renders -- worst case the
    // link is absent and the route is still reachable by typing it.
  }
  return <Dashboard opsHref={opsHref} />;
}
