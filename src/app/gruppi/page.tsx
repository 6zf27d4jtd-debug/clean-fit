import { ComingSoon, PageHeader } from "@/components/page-header";

export default function GruppiPage() {
  return (
    <>
      <PageHeader title="Gruppi" subtitle="Estiva, sportiva, tutto nero…" />
      <ComingSoon phase={3}>
        Qui vedrai i tuoi raggruppamenti e i capi che contengono. Un capo può stare in più gruppi.
      </ComingSoon>
    </>
  );
}
