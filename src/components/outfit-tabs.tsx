"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClockIcon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";

const TABS = [
  { href: "/outfit", label: "Proponi" },
  { href: "/outfit/salvati", label: "Salvati" },
];

/** Interruttore in alto nella pagina Outfit: proposte del giorno oppure outfit salvati. */
export function OutfitTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Outfit" className="mb-6 grid grid-cols-2 gap-1 rounded-2xl bg-surface-muted p-1">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`flex h-11 items-center justify-center rounded-xl text-[15px] font-medium transition-colors ${
              active ? "bg-background shadow-sm" : "text-muted"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Intestazione comune a Proponi e Salvati: titolo, Storico e interruttore. */
export function OutfitHeader({ subtitle }: { subtitle: string }) {
  return (
    <>
      <PageHeader
        title="Outfit"
        subtitle={subtitle}
        action={
          <Link
            href="/outfit/storico"
            className="flex h-11 items-center gap-1.5 rounded-full bg-surface px-4 text-[15px] font-medium ring-1 ring-line active:scale-[0.97]"
          >
            <ClockIcon width={18} height={18} />
            Storico
          </Link>
        }
      />
      <OutfitTabs />
    </>
  );
}
