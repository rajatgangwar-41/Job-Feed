import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Landing from "@/components/Landing";

// Public, and the default destination for anyone without a session. Someone
// who is already signed in has no use for the pitch, so they go straight to
// their board -- decided on the server, so there is no flash of the landing
// page on the way through.
export default async function Page() {
  const { userId } = await auth();
  if (userId) redirect("/dashboard");
  return <Landing />;
}
