// Clerk is the identity provider. `domain` is the Issuer URL from the Clerk
// dashboard's JWT template named exactly "convex" -- set it with
//   npx convex env set CLERK_JWT_ISSUER_DOMAIN https://<your>.clerk.accounts.dev
// so the value lives in Convex's environment rather than in the repo.
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN,
      applicationID: "convex",
    },
  ],
};
