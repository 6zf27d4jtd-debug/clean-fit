import { Suspense } from "react";
import { CategoryView, CategoryViewSkeleton } from "@/components/category-view";

// L'id arriva dall'indirizzo, noto solo nel browser: con Cache Components va letto dentro un Suspense.
export default function CategoriaPage({ params }: PageProps<"/categoria/[id]">) {
  return (
    <Suspense fallback={<CategoryViewSkeleton />}>
      <CategoryView params={params} />
    </Suspense>
  );
}
