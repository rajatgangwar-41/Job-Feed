import "server-only";

// The operator route's path, in exactly one place.
//
// `server-only` is the guard, not a convention: if any client component ever
// imports this module the build fails, rather than quietly inlining the path
// into a chunk under /_next/static where it would be readable by anyone. The
// path reaches the browser only as a prop on a rendered page, and only for a
// caller the allowlist has already accepted -- everybody else's HTML simply
// has no link in it.
//
// Renaming it means renaming the directory under src/app to match. Nothing
// else refers to it.
export const OPS_PATH = "/2uj10p8hykdk0l";
