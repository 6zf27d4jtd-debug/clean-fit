import Link from "next/link";
import { AccountSection, RecentDaysSetting } from "@/components/account-section";
import { AdminSection } from "@/components/admin-section";
import { PageHeader } from "@/components/page-header";
import { ThemeSelector } from "@/components/theme-selector";
import packageJson from "../../../package.json";

const SOURCE_URL = "https://github.com/6zf27d4jtd-debug/clean-fit";
// Versione da package.json, mostrata come "1.0" (senza l'ultima cifra)
const APP_VERSION = packageJson.version.split(".").slice(0, 2).join(".");

/** Link del piè di pagina: piccoli, ma con un'area da toccare di 44px. */
const footerLink = "inline-flex min-h-11 items-center px-1.5 underline-offset-2 active:underline";

export default function ProfiloPage() {
  return (
    <>
      <PageHeader title="Profilo" />
      <section className="space-y-3">
        <h2 className="text-[13px] font-medium tracking-wide text-muted uppercase">Aspetto</h2>
        <ThemeSelector />
      </section>
      <RecentDaysSetting />
      <AdminSection />
      <AccountSection />
      <footer className="mt-8 flex flex-wrap items-center justify-center text-[13px] text-muted/80">
        <Link href="/privacy" className={footerLink}>
          Privacy
        </Link>
        <span aria-hidden="true">·</span>
        {/* Richiesto dalla licenza AGPL-3.0: chi usa l'app deve poter avere il codice sorgente */}
        <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer" className={footerLink}>
          Codice sorgente
        </a>
        <span aria-hidden="true">·</span>
        <span className="px-1.5">Clean Fit {APP_VERSION}</span>
      </footer>
    </>
  );
}
