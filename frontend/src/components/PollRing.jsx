"use client";
import { useEffect, useState } from "react";
import { ago, absTime } from "@/lib/format";
import { cx } from "@/lib/cx";

// Time until the next poll, as a ring that empties.
//
// This replaces a sentence ("Polled 2m Ago · Next In ~8m · Internshala,
// Foundit, Naukri, Indeed Failing") that grew with the number of failing
// sources and pushed the toolbar onto a second row. A fixed 40x40 box cannot
// do that: success and failure occupy exactly the same space, and the detail
// that used to be spelled out moves into the tooltip.
//
// It keeps its own one-second interval rather than reading the Dashboard's
// clock, which ticks every 30s -- seconds have to move for a countdown to
// read as one, and re-rendering the whole board that often to achieve it
// would be absurd.
const SIZE = 40;
const STROKE = 3;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

export default function PollRing({ lastPoll, pollMinutes = 15, polling, failing = [] }) {
  const [nowSec, setNowSec] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const id = setInterval(() => setNowSec(Date.now() / 1000), 1000);
    return () => clearInterval(id);
  }, []);

  const total = Math.max(1, pollMinutes * 60);
  const due = lastPoll ? lastPoll + total : null;
  // Signed, deliberately. A scrape that overruns its interval, a paused
  // poller, or a backend that is simply not running all push the due time
  // into the past, and a countdown pinned at 0:00 cannot tell you which --
  // it just looks broken. Past due the sign flips and it counts up instead,
  // so the widget is always moving and the number means something.
  const delta = due == null ? null : Math.round(due - nowSec);
  const overdue = delta != null && delta <= 0;
  // The clamp belongs to the countdown branch alone, where a browser clock
  // behind the server's would otherwise overdraw the arc. Clamping the
  // overdue branch too would freeze it at "+10:00" once the poller had been
  // down for a full cycle -- reinventing the stuck 0:00 one number along.
  const secs = delta == null ? null
    : overdue ? -delta
    : Math.min(total, delta);
  const frac = overdue || secs == null ? 0 : secs / total;

  const bad = failing.length > 0;
  const stroke = polling ? "var(--accent)"
    : bad ? "var(--danger)"
    : overdue ? "var(--text-faint)"
    : "var(--success)";

  // m:ss up to an hour, then h:mm -- so a poller that has been down all
  // afternoon still reads as a time rather than "+412:07", and still moves.
  const clock = secs == null ? "--:--"
    : secs < 3600 ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`
    : `${Math.floor(secs / 3600)}h${String(Math.floor((secs % 3600) / 60)).padStart(2, "0")}`;
  const label = polling ? "···" : overdue ? `+${clock}` : clock;

  const title = [
    polling ? "Polling now" : lastPoll ? `Polled ${ago(lastPoll)} ago (${absTime(lastPoll)})` : "Not polled yet",
    !polling && delta != null && (overdue
      ? `Poll overdue by ${clock} — is the scraper running?`
      : `Next poll in ${clock}`),
    bad && `Failing: ${failing.join(", ")}`,
  ].filter(Boolean).join(" · ");

  return (
    <div
      title={title}
      aria-label={title}
      role="img"
      // flex-none + a fixed box is the whole point: nothing here reflows when
      // a source starts or stops failing.
      className="relative grid h-10 w-10 flex-none place-items-center"
    >
      <svg
        width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}
        className={polling ? "animate-spin [animation-duration:1.6s]" : undefined}
      >
        <circle
          cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none"
          stroke="var(--border)" strokeWidth={STROKE}
        />
        <circle
          cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none"
          stroke={stroke} strokeWidth={STROKE} strokeLinecap="round"
          strokeDasharray={C}
          // Full circle at a fresh poll, nothing left when one is due. While
          // polling there is no countdown to draw, so a quarter arc spins
          // instead of an arc that would sit empty.
          strokeDashoffset={polling ? C * 0.75 : C * (1 - frac)}
          // Linear, and exactly one tick long, so the arc creeps rather than
          // stepping once a second.
          className={polling ? undefined : "transition-[stroke-dashoffset] duration-1000 ease-linear"}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      </svg>
      {!polling && (
        // Past due the arc is empty, so the colour has nothing left to ride
        // on -- the label carries the state instead. Sized down for the sixth
        // character "+10:00" adds, which would otherwise touch the stroke.
        <span className={cx(
          "pointer-events-none absolute leading-none font-semibold tracking-tight tabular-nums",
          label.length > 5 ? "text-[9px]" : "text-[10.5px]",
          bad ? "text-danger" : overdue ? "text-text-faint" : "text-text",
        )}>
          {label}
        </span>
      )}
    </div>
  );
}
