import type { ReactNode } from "react";

export default function PrimePageHeading({ icon, title, subtitle, actions }: { icon?: ReactNode; title: string; subtitle?: string; actions?: ReactNode }) {
  return <header className="prime-page-heading flex items-center justify-between gap-3 border-b border-slate-200 sticky top-0 z-10">
    <div className="flex min-w-0 items-center gap-2.5">
      {icon ? <span className="prime-page-heading__icon shrink-0">{icon}</span> : null}
      <div className="min-w-0"><h2 className="truncate uppercase">{title}</h2>{subtitle ? <p className="truncate text-slate-500">{subtitle}</p> : null}</div>
    </div>
    {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
  </header>;
}
