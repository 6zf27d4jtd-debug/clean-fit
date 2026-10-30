import { BackgroundTest } from "@/components/background-test";
import { PageHeader } from "@/components/page-header";

// Pagina temporanea (ramo prova/birefnet): confronto WebGPU / WASM per la rimozione sfondo con imgly.
export default function ProvaSfondoPage() {
  return (
    <>
      <PageHeader title="Prova sfondo" subtitle="imgly ISNet · WebGPU o WASM" />
      <BackgroundTest />
    </>
  );
}
