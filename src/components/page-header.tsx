import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeftIcon } from "@/components/icons";

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

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="-ml-2 inline-flex h-11 items-center gap-0.5 pr-3 text-[15px] text-muted">
      <ChevronLeftIcon width={22} height={22} />
      {label}
    </Link>
  );
}

export function ItemGridSkeleton() {
  return (
    <ul className="grid grid-cols-2 gap-3">
      {Array.from({ length: 4 }, (_, i) => (
        <li key={i} className="aspect-[3/4] animate-pulse rounded-2xl bg-surface-muted" />
      ))}
    </ul>
  );
}
