import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex items-end justify-between gap-4 pt-6 pb-6">
      <div>
        <h1 className="text-[32px] leading-tight font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-[15px] text-muted">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export function ComingSoon({ phase, children }: { phase: number; children: ReactNode }) {
  return (
    <div className="rounded-3xl border border-dashed border-line px-6 py-12 text-center">
      <p className="text-[15px] leading-relaxed text-muted">{children}</p>
      <p className="mt-3 text-xs font-medium tracking-wide text-muted uppercase">
        In arrivo nella fase {phase}
      </p>
    </div>
  );
}
