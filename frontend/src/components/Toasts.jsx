"use client";

export default function Toasts({ toasts, dismiss }) {
  return (
    <div id="toasts" className="fixed bottom-[18px] left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-1.5">
      {toasts.map((t) => (
        <div key={t.id} className="animate-toast-up flex items-center gap-3 rounded-[10px] bg-text px-3 py-2 pl-3.5 text-[12.5px] text-bg shadow-[var(--shadow-pop)]">
          <span>{t.msg}</span>
          {t.undo && (
            <button type="button" className="rounded px-1 font-bold underline" onClick={() => { t.undo(); dismiss(t.id); }}>
              Undo
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
