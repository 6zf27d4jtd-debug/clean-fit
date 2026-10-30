import { PageHeader } from "@/components/page-header";
import { DEFAULT_CATEGORIES } from "@/lib/categories";

export default function HomePage() {
  return (
    <>
      <PageHeader title="Armadio" subtitle="0 capi" />
      <ul className="grid grid-cols-2 gap-3">
        {DEFAULT_CATEGORIES.map((category) => (
          <li key={category.name}>
            <div className="flex aspect-[4/5] flex-col justify-between rounded-3xl bg-surface p-4 ring-1 ring-line">
              <div className="flex flex-1 items-center justify-center rounded-2xl bg-surface-muted" />
              <div className="pt-3">
                <p className="text-[15px] leading-tight font-semibold">{category.name}</p>
                <p className="mt-0.5 text-[13px] text-muted">0 capi</p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
