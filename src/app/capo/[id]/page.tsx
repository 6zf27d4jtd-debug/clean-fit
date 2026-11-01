import { Suspense } from "react";
import { ItemView, ItemViewSkeleton } from "@/components/item-view";

// L'id arriva dall'indirizzo, noto solo nel browser: con Cache Components va letto dentro un Suspense.
export default function CapoPage({ params }: PageProps<"/capo/[id]">) {
  return (
    <Suspense fallback={<ItemViewSkeleton />}>
      <ItemView params={params} />
    </Suspense>
  );
}
