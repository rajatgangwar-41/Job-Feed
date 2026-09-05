import { auth } from "@clerk/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { notFound } from "next/navigation";
import { api } from "@convex/_generated/api";
import AdminPanel from "@/components/AdminPanel";
import { OPS_PATH } from "@/lib/ops";

// Deliberately not listed in src/middleware.js's protected matcher. Protected
// routes *redirect* a signed-out visitor, and a redirect tells them the route
// exists; this checks the allowlist itself and calls notFound(), so it is a
// plain 404 for everybody who is not on it -- signed out, signed in, or
// walking a wordlist. Indistinguishable from a route that was never built.
//
// Everything below runs on the server and nothing here is a client
// component, so no chunk describing this page is ever written to
// /_next/static. Static assets have no auth in front of them, so a chunk is
// effectively public once its filename is known; the fix is not to have one.
//
// The data fetches happen after the allowlist check rather than in parallel
// with it, so a caller who is not an operator never causes a read of anyone
// else's rows -- and the Convex functions would refuse them anyway.
export const metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }) {
  const { getToken } = await auth();
  // The template name must match the Clerk JWT template Convex is configured
  // against, or the token carries no identity Convex recognises.
  const token = await getToken({ template: "convex" }).catch(() => null);
  if (!token) notFound();

  const allowed = await fetchQuery(api.admin.isAdmin, {}, { token }).catch(() => false);
  if (!allowed) notFound();

  // Selection is a URL parameter rather than component state: this page has
  // no client JavaScript to hold state in, which is the point.
  const params = await searchParams;
  const selectedUserId = typeof params?.user === "string" ? params.user : null;
  // Safe here in a way it would not be in a client component: this is an
  // async Server Component with `dynamic = "force-dynamic"`, so it runs once
  // per request and never re-renders. The lint rule guards against a value
  // that shifts under a re-render, which cannot happen on this side.
  // eslint-disable-next-line react-hooks/purity
  const now = Math.floor(Date.now() / 1000);

  const [overview, people, board] = await Promise.all([
    selectedUserId ? null : fetchQuery(api.admin.overview, {}, { token }).catch(() => null),
    selectedUserId ? null : fetchQuery(api.admin.people, { now }, { token }).catch(() => null),
    selectedUserId ? fetchQuery(api.admin.board, { userId: selectedUserId, now }, { token }).catch(() => null) : null,
  ]);

  return (
    <AdminPanel
      overview={overview} people={people} board={board}
      selectedUserId={selectedUserId} basePath={OPS_PATH}
    />
  );
}
