"use client";
import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";

// One client for the whole app. Created at module scope, not per render, so
// a re-render never tears down the websocket and re-subscribes every query.
const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL);

// ConvexProviderWithClerk hands Convex the Clerk session token and refreshes
// it, which is what makes `ctx.auth.getUserIdentity()` resolve inside a
// query. Clerk has to be the outer provider -- Convex reads `useAuth` from
// its context.
export default function ConvexClientProvider({ children }) {
  return (
    <ClerkProvider>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        {children}
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
