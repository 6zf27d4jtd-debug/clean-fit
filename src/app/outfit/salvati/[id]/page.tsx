import { Suspense } from "react";
import { OutfitBuilderSkeleton, SavedOutfitEditor } from "@/components/outfit-builder";
import { BackLink, PageHeader } from "@/components/page-header";

// L'id arriva dall'indirizzo, noto solo nel browser: con Cache Components va letto dentro un Suspense.
export default function ModificaOutfitPage({ params }: PageProps<"/outfit/salvati/[id]">) {
  return (
    <>
      <BackLink href="/outfit/salvati" label="Salvati" />
      <PageHeader title="Modifica outfit" />
      <Suspense fallback={<OutfitBuilderSkeleton />}>
        <SavedOutfitEditor params={params} />
      </Suspense>
    </>
  );
}
