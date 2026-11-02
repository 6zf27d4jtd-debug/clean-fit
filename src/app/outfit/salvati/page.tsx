import { OutfitHeader } from "@/components/outfit-tabs";
import { SavedOutfits } from "@/components/saved-outfits";

export default function SalvatiPage() {
  return (
    <>
      <OutfitHeader subtitle="Pronti da indossare" />
      <SavedOutfits />
    </>
  );
}
