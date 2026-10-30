import { ComingSoon, PageHeader } from "@/components/page-header";

export default function AggiungiPage() {
  return (
    <>
      <PageHeader title="Aggiungi" subtitle="Fronte, retro e via" />
      <ComingSoon phase={2}>
        Scatta o scegli la foto del fronte e del retro: lo sfondo verrà rimosso automaticamente.
      </ComingSoon>
    </>
  );
}
