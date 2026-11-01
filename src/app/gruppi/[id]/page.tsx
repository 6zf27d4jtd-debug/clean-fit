import { Suspense } from "react";
import { GroupView, GroupViewSkeleton } from "@/components/group-view";

// L'id arriva dall'indirizzo, noto solo nel browser: con Cache Components va letto dentro un Suspense.
export default function GruppoPage({ params }: PageProps<"/gruppi/[id]">) {
  return (
    <Suspense fallback={<GroupViewSkeleton />}>
      <GroupView params={params} />
    </Suspense>
  );
}
