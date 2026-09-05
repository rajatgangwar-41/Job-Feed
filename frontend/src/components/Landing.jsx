import { SignInButton, SignUpButton } from "@clerk/nextjs";
import { SRC_NAME, SRC_COLOR, ORDER } from "@/lib/constants";
import { IconChart, IconFilter, IconKanban, IconSearch } from "./icons";

// The public face. app/page.js redirects anyone with a session straight to
// their board, so this only ever renders for a signed-out visitor -- which
// means it can talk about the product instead of doubling as a shell.
const FEATURES = [
  { icon: IconSearch, title: "One screen, seven boards",
    body: "Internshala, Foundit, Naukri, Indeed, Cutshort, Wellfound and Y Combinator, polled every few minutes and deduped into a single feed." },
  { icon: IconFilter, title: "Filters that mean something",
    body: "Fresher-only by default. Narrow by experience, salary band, city, remote, source or age — and save the combinations you keep coming back to." },
  { icon: IconKanban, title: "A pipeline, not a bookmark pile",
    body: "Drag a listing through your own columns, from Saved to Selected. Rename, reorder and add stages; every card keeps its notes." },
  { icon: IconChart, title: "Know where applications die",
    body: "Response rate, rejection rate, median time to reply, and a funnel that counts everyone who ever reached a stage — not just who is sitting there today." },
];

const PREVIEW = [
  { name: "Applied", color: "#2563eb", cards: [["Frontend Engineer", "Certa"], ["Full Stack Developer", "WhichRanks"]] },
  { name: "Shortlisted", color: "#7c3aed", cards: [["Software Developer", "Uniprep"]] },
  { name: "Interview Round 2", color: "#c026d3", cards: [["AI Associate", "QuickHyre"]] },
];

export default function Landing() {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="flex items-center gap-2.5 border-b border-border bg-surface px-4 py-2.5">
        <span className="grid h-6 w-6 place-items-center rounded-[7px] bg-gradient-to-br from-accent to-violet text-[12px] font-extrabold text-white">JW</span>
        <span className="text-[15px] font-semibold tracking-tight">Job Watch</span>
        <div className="ml-auto flex items-center gap-1.5">
          <SignInButton mode="modal" forceRedirectUrl="/dashboard">
            <button type="button" className="rounded-md px-3 py-1.5 text-[12.5px] font-medium text-text-dim transition-colors duration-150 hover:bg-surface-2 hover:text-text">
              Sign in
            </button>
          </SignInButton>
          <SignUpButton mode="modal" forceRedirectUrl="/dashboard">
            <button type="button" className="rounded-md bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-white transition-[filter] duration-150 hover:brightness-110">
              Sign up
            </button>
          </SignUpButton>
        </div>
      </header>

      <main className="flex-1 px-4 py-10 sm:py-14">
        <div className="mx-auto flex max-w-[940px] flex-col gap-12">
          <section className="flex flex-col items-center text-center">
            <h1 className="max-w-[640px] text-[30px] font-semibold leading-[1.15] tracking-tight text-text sm:text-[40px]">
              Every fresher tech opening,
              <span className="block text-accent-text">on one screen.</span>
            </h1>
            <p className="mt-4 max-w-[520px] text-[14px] leading-relaxed text-text-dim">
              Job Watch polls seven job boards in the background, throws out the noise, and
              gives you one feed and one pipeline to move things through. You still click
              through and apply yourself — it never submits anything on your behalf.
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5">
              <SignUpButton mode="modal" forceRedirectUrl="/dashboard">
                <button type="button" className="rounded-lg bg-accent px-5 py-2.5 text-[13.5px] font-semibold text-white shadow-[var(--shadow-card)] transition-[filter] duration-150 hover:brightness-110">
                  Get started — it&apos;s free
                </button>
              </SignUpButton>
              <SignInButton mode="modal" forceRedirectUrl="/dashboard">
                <button type="button" className="rounded-lg border border-border bg-surface px-5 py-2.5 text-[13.5px] font-medium text-text transition-colors duration-150 hover:border-border-strong hover:bg-surface-2">
                  I already have an account
                </button>
              </SignInButton>
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5">
              {ORDER.map((s) => (
                <span key={s} className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-[11.5px] font-medium text-text-muted">
                  <span className="h-2 w-2 flex-none rounded-full" style={{ background: SRC_COLOR[s] }} />
                  {SRC_NAME[s] || s}
                </span>
              ))}
            </div>
          </section>

          {/* A still of the real board rather than a screenshot -- it stays
              honest through a redesign, and inherits the theme the visitor
              is actually using. */}
          <section aria-label="Board preview" className="rounded-2xl border border-border bg-surface-2 p-3 shadow-[var(--shadow-card)]">
            <div className="grid gap-3 sm:grid-cols-3">
              {PREVIEW.map((col) => (
                <div key={col.name} className="overflow-hidden rounded-xl border border-border bg-surface-2">
                  <div className="h-[3px]" style={{ background: col.color }} />
                  <div className="flex items-center gap-1.5 border-b border-border bg-surface px-2.5 py-2">
                    <span className="h-2 w-2 flex-none rounded-full" style={{ background: col.color }} />
                    <span className="truncate text-[13px] font-semibold text-text">{col.name}</span>
                    <span className="ml-auto rounded-full bg-surface-2 px-1.5 text-[10.5px] font-bold tabular-nums text-text-dim">{col.cards.length}</span>
                  </div>
                  <div className="flex flex-col gap-2 p-2">
                    {col.cards.map(([title, company]) => (
                      <div key={title} className="rounded-lg border border-border bg-surface px-2.5 py-2 shadow-[var(--shadow-card)]">
                        <div className="text-[12.5px] font-semibold leading-snug text-text">{title}</div>
                        <div className="mt-0.5 text-[11.5px] text-text-muted">{company}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="grid gap-x-8 gap-y-7 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex gap-3">
                <span className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-accent-soft text-accent-text">
                  <f.icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-[13.5px] font-semibold text-text">{f.title}</h2>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-text-dim">{f.body}</p>
                </div>
              </div>
            ))}
          </section>
        </div>
      </main>

      <footer className="border-t border-border px-4 py-5 text-center text-[11.5px] text-text-faint">
        Job Watch reads public listings and tracks your own applications. It never applies,
        submits, or messages anyone for you.
      </footer>
    </div>
  );
}
