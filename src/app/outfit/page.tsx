import { OutfitBuilder } from "@/components/outfit-builder";
import { OutfitHeader } from "@/components/outfit-tabs";

export default function OutfitPage() {
  return (
    <>
      <OutfitHeader subtitle="Proposte per oggi" />
      <OutfitBuilder />
    </>
  );
}
