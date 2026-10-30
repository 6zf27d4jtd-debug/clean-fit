import { ComingSoon, PageHeader } from "@/components/page-header";

export default function StoricoPage() {
  return (
    <>
      <PageHeader title="Storico" subtitle="Gli outfit che hai scelto" />
      <ComingSoon phase={5}>Qui troverai gli outfit indossati, dal più recente.</ComingSoon>
    </>
  );
}
