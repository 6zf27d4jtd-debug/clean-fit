import Link from "next/link";
import { AccountSection, RecentDaysSetting } from "@/components/account-section";
import { ChevronRightIcon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { ThemeSelector } from "@/components/theme-selector";

export default function ProfiloPage() {
  return (
    <>
      <PageHeader title="Profilo" />
      <section className="space-y-3">
        <h2 className="text-[13px] font-medium tracking-wide text-muted uppercase">Aspetto</h2>
        <ThemeSelector />
      </section>
      <RecentDaysSetting />
      <section className="mt-10 space-y-3">
        <h2 className="text-[13px] font-medium tracking-wide text-muted uppercase">Informazioni</h2>
        <ul className="divide-y divide-line rounded-2xl bg-surface ring-1 ring-line">
          <li>
            <Link href="/privacy" className="flex min-h-13 items-center justify-between gap-3 px-4 text-[15px] font-medium">
              Privacy
              <ChevronRightIcon width={20} height={20} className="shrink-0 text-muted" />
            </Link>
          </li>
        </ul>
      </section>
      <AccountSection />
    </>
  );
}
