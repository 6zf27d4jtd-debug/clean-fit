import { ComingSoon, PageHeader } from "@/components/page-header";
import { ThemeSelector } from "@/components/theme-selector";

export default function ProfiloPage() {
  return (
    <>
      <PageHeader title="Profilo" />
      <section className="space-y-3">
        <h2 className="text-[13px] font-medium tracking-wide text-muted uppercase">Aspetto</h2>
        <ThemeSelector />
      </section>
      <section className="mt-10 space-y-3">
        <h2 className="text-[13px] font-medium tracking-wide text-muted uppercase">Account</h2>
        <ComingSoon phase={1}>Registrazione, accesso, uscita ed eliminazione dell’account.</ComingSoon>
      </section>
    </>
  );
}
