import Link from "next/link";
import { ClockIcon } from "@/components/icons";
import { OutfitBuilder } from "@/components/outfit-builder";
import { PageHeader } from "@/components/page-header";

export default function OutfitPage() {
  return (
    <>
      <PageHeader
        title="Outfit"
        subtitle="Proposte per oggi"
        action={
          <Link
            href="/outfit/storico"
            className="flex h-11 items-center gap-1.5 rounded-full bg-surface px-4 text-[15px] font-medium ring-1 ring-line active:scale-[0.97]"
          >
            <ClockIcon width={18} height={18} />
            Storico
          </Link>
        }
      />
      <OutfitBuilder />
    </>
  );
}
