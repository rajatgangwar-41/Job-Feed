import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Everything under /dashboard requires a session. The check runs at the edge
// before the page renders, so a signed-out visitor is redirected to sign-in
// rather than briefly seeing an empty board -- and the Convex queries behind
// it independently refuse to answer without an identity, so the route guard
// is defence in depth, not the only lock.
const isProtected = createRouteMatcher(["/dashboard(.*)"]);

export default clerkMiddleware(async (auth, request) => {
  // `unauthenticatedUrl` is explicit on purpose. Left to itself, protect()
  // sends a signed-out visitor to Clerk's sign-in page, and answers a
  // non-document request (Accept: */*) with a 404 instead. Naming the
  // landing page makes the destination the same one every other signed-out
  // route resolves to, whatever the request looks like.
  if (isProtected(request)) {
    await auth.protect({ unauthenticatedUrl: new URL("/", request.url).toString() });
  }
});

export const config = {
  // Skip Next internals and static files; run on everything else, including
  // /api routes so a server action can read the session.
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
