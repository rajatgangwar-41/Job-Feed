import { SignIn } from "@clerk/nextjs";
import Link from "next/link";

// A real route as well as the modal on the landing page: Clerk's own
// redirects (and NEXT_PUBLIC_CLERK_SIGN_IN_URL, which `clerk init` set) land
// here, so it has to look like the rest of the app rather than a bare
// centred widget on a white page.
export const metadata = { title: "Sign in · Job Watch" };

export default function Page() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-12">
      <Link href="/" className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight text-text no-underline">
        <span className="grid h-6 w-6 place-items-center rounded-[7px] bg-gradient-to-br from-accent to-violet text-[12px] font-extrabold text-white">JW</span>
        Job Watch
      </Link>
      <SignIn />
      <Link href="/" className="text-[12px] text-text-dim no-underline hover:text-text">
        Back to the home page
      </Link>
    </div>
  );
}
