import { AddItem } from "@/components/add-item";
import { PageHeader } from "@/components/page-header";

export default function AggiungiPage() {
  return (
    <>
      <PageHeader title="Aggiungi" subtitle="Fronte, retro e via" />
      <AddItem />
    </>
  );
}
