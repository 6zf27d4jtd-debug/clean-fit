import { OutfitHistory } from "@/components/outfit-history";
import { BackLink, PageHeader } from "@/components/page-header";

export default function StoricoPage() {
  return (
    <>
      <BackLink href="/outfit" label="Outfit" />
      <PageHeader title="Storico" subtitle="Gli outfit che hai scelto" />
      <OutfitHistory />
    </>
  );
}
