import { AccountSection, RecentDaysSetting } from "@/components/account-section";
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
      <AccountSection />
    </>
  );
}
