import Link from "next/link";
import { absTime, ago, srcColor, srcName } from "@/lib/format";
import { cx } from "@/lib/cx";
import GraphView from "./GraphView";
import { BarRow, DataTable, Meter } from "./charts";
import { IconChevronLeft, IconKanban, IconLayers } from "./icons";

// Deliberately NOT a client component.
//
// As a client component this compiled into its own static chunk under
// /_next/static, carrying the Convex function names and every label on the
// page -- served to anyone who guessed the filename, with no auth in front
// of it, because static assets have none. Rendering on the server instead
// means none of it reaches a browser as code: the operator receives plain
// HTML, and everybody else receives a 404 from the route above with nothing
// attached to it.
//
// The cost is that selection has to be a link rather than component state,
// which is why a person is chosen through ?user= instead of useState.
// GraphView stays a client component, but it is the same one /dashboard
// already ships, so it adds nothing admin-specific to the bundle.
export default function AdminPanel({ overview, people, board, selectedUserId, basePath }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-2.5 border-b border-border bg-surface px-3.5 py-2">
        <span className="grid h-6 w-6 place-items-center rounded-[7px] bg-gradient-to-br from-accent to-violet text-[12px] font-extrabold text-white">JW</span>
        <span className="text-[15px] font-semibold tracking-tight">Job Watch</span>
        <div className="ml-auto">
          <Link href="/dashboard" className="rounded-md px-2.5 py-1.5 text-[12.5px] font-medium text-text-dim no-underline transition-colors duration-150 hover:bg-surface-2 hover:text-text">
            My board
          </Link>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {selectedUserId
          ? <Person board={board} basePath={basePath} />
          : <Everyone overview={overview} people={people} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- aggregates
function Everyone({ overview: o, people }) {
  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-3.5 px-4 pb-8 pt-4">
      <div>
        <h1 className="text-[15px] font-semibold text-text">Across everyone</h1>
        <p className="mt-0.5 text-[12px] text-text-faint">
          Nobody is named here. These are the numbers a report is made of; open a
          person below only when one of them needs explaining.
        </p>
      </div>

      {!o ? <Empty /> : (
        <>
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            <Tile label="Accounts" value={o.people} caption={`${o.active} have tracked something`} />
            <Tile label="Applications" value={o.applications} caption="Across all accounts" />
            <Tile label="Response rate" value={o.respondedPct == null ? "—" : `${o.respondedPct}%`}
              pct={o.respondedPct} tone="active" caption={`${o.responded} moved past applied`} />
            <Tile label="Rejection rate" value={o.rejectionsPct == null ? "—" : `${o.rejectionsPct}%`}
              pct={o.rejectionsPct} tone="lost" caption={`${o.rejections} rejected`} />
          </div>

          <Panel title="Applications by source" subtitle="Which board people actually apply through">
            {o.bySource.length === 0 ? <Empty /> : o.bySource.map((r) => (
              <BarRow key={r.key} name={srcName(r.key)} dot={srcColor(r.key)}
                value={r.count} max={Math.max(...o.bySource.map((x) => x.count))} />
            ))}
          </Panel>

          <Panel title="Where cards sit right now" subtitle="Current stage across every board">
            {o.byStage.length === 0 ? <Empty /> : o.byStage.map((r) => (
              <BarRow key={r.key} name={r.key} value={r.count}
                max={Math.max(...o.byStage.map((x) => x.count))} />
            ))}
          </Panel>

          <Panel title="Most applied-to companies" subtitle="Counted once per application">
            {o.topCompanies.length === 0 ? <Empty /> : (
              <DataTable columns={["Company", "Applications"]}
                rows={o.topCompanies.map((r) => [r.key, r.count])} />
            )}
          </Panel>
        </>
      )}

      <Panel title="People" subtitle="Sorted by most recently active. Open one to see their tracker.">
        {!people || people.length === 0 ? <Empty /> : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="border-b border-border text-text-dim">
                  {["Person", "Tracked", "Applied", "7d", "Rejected", "Last seen", ""].map((h, i) => (
                    <th key={h + i} className={cx("py-1.5 pr-3 font-semibold", i === 0 ? "text-left" : "text-right")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.userId} className="border-b border-border/60 last:border-0 hover:bg-surface-2">
                    <td className="min-w-0 py-1.5 pr-3">
                      <div className="truncate font-medium text-text">{p.email || p.name || "—"}</div>
                      <div className="truncate text-[10.5px] text-text-faint">{p.userId}</div>
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-text">{p.tracked}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-text">{p.applied}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-text-dim">{p.applied7}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-text-dim">{p.rejected}</td>
                    <td className="py-1.5 pr-3 text-right whitespace-nowrap text-text-faint">
                      {p.lastLoadAt ? `${ago(p.lastLoadAt)} ago` : "—"}
                    </td>
                    <td className="py-1.5 text-right">
                      <Link href={`?user=${encodeURIComponent(p.userId)}`}
                        className="rounded-md border border-border px-2 py-0.5 text-[11.5px] font-medium text-text-dim no-underline transition-colors duration-150 hover:border-border-strong hover:bg-surface hover:text-text">
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

// ------------------------------------------------------------- one person
function Person({ board, basePath }) {
  if (!board) return <div className="p-6"><Empty /></div>;

  // Grouped in column order, so the shape of the list matches the shape of
  // the board it came from.
  const byStage = new Map();
  for (const j of board.jobs) {
    if (!j.stage) continue;
    if (!byStage.has(j.stage)) byStage.set(j.stage, []);
    byStage.get(j.stage).push(j);
  }
  const columns = board.stages
    .map((s) => ({ stage: s, jobs: byStage.get(s.id) || [] }))
    .filter((c) => c.jobs.length > 0);

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <Link href={basePath}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-[12.5px] font-medium text-text-dim no-underline transition-colors duration-150 hover:bg-surface-2 hover:text-text">
          <IconChevronLeft className="h-3.5 w-3.5" /> Everyone
        </Link>
        {board.person && (
          <>
            <span className="text-[13px] font-semibold text-text">{board.person.email || board.person.name || "—"}</span>
            <span className="text-[11.5px] text-text-faint">joined {absTime(board.person.createdAt)}</span>
          </>
        )}
      </div>

      {board.jobs.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 p-10 text-center text-[13px] text-text-dim">
          <IconLayers className="mb-1 h-6 w-6 text-text-faint" />
          <div className="font-medium text-text-muted">Nothing tracked yet</div>
          <div className="text-[12px]">This account has signed in but has not put a listing on its board.</div>
        </div>
      ) : (
        <>
          {/* The owner's own analytics, unchanged, so this cannot drift from
              what they see on their own board. */}
          <div className="min-h-[540px] border-b border-border">
            <GraphView allJobs={board.jobs} stages={board.stages} funnel={board.funnel} history={board.history} />
          </div>

          <div className="mx-auto w-full max-w-[900px] px-4 pb-8 pt-4">
            <div className="mb-3 flex items-center gap-2">
              <IconKanban className="h-4 w-4 text-text-dim" />
              <h2 className="text-[13px] font-semibold text-text">Pipeline right now</h2>
              <span className="text-[11.5px] text-text-faint">{board.jobs.filter((j) => j.stage).length} on the board</span>
            </div>
            <div className="flex flex-col gap-3">
              {columns.map(({ stage, jobs }) => (
                <section key={stage.id} className="overflow-hidden rounded-xl border border-border bg-surface">
                  <div className="flex items-center gap-1.5 border-b border-border px-3 py-2"
                    style={{ background: `color-mix(in srgb, ${stage.color} 7%, var(--surface))` }}>
                    <span className="h-2 w-2 flex-none rounded-full" style={{ background: stage.color }} />
                    <span className="text-[12.5px] font-semibold text-text">{stage.name}</span>
                    <span className="ml-auto rounded-full bg-surface-2 px-1.5 text-[10.5px] font-bold tabular-nums text-text-dim">{jobs.length}</span>
                  </div>
                  <ul className="divide-y divide-border/60">
                    {jobs.map((j) => (
                      <li key={j.uid} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-3 py-2">
                        <span className="h-2 w-2 flex-none rounded-full" style={{ background: srcColor(j.source) }} title={srcName(j.source)} />
                        <span className="text-[12.5px] font-medium text-text">{j.title}</span>
                        <span className="text-[11.5px] text-text-muted">{j.company || "—"}</span>
                        {j.applied_at && <span className="ml-auto text-[10.5px] whitespace-nowrap text-text-faint">applied {ago(j.applied_at)} ago</span>}
                        {j.notes ? <span className="basis-full text-[11.5px] italic text-text-dim">“{j.notes}”</span> : null}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              {columns.length === 0 && <Empty />}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- fragments
function Panel({ title, subtitle, children }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-3.5 shadow-[var(--shadow-card)]">
      <div className="mb-3">
        <h2 className="text-[13px] font-semibold text-text">{title}</h2>
        {subtitle && <p className="mt-px text-[11.5px] text-text-faint">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function Tile({ label, value, caption, pct, tone }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2.5 shadow-[var(--shadow-card)]">
      <div className="text-[11px] font-medium text-text-dim">{label}</div>
      <div className="mt-0.5 text-[21px] font-semibold leading-none text-text">{value}</div>
      {pct != null && <Meter pct={pct} tone={tone} />}
      {caption && <div className="mt-1.5 text-[10.5px] leading-tight text-text-faint">{caption}</div>}
    </div>
  );
}

function Empty() {
  return <p className="py-4 text-center text-[12px] text-text-faint">Nothing to show yet.</p>;
}
