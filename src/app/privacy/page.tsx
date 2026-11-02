import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/page-header";
import { PrivacyBackLink } from "@/components/privacy-back-link";

export const metadata: Metadata = { title: "Privacy · Clean Fit" };

const CONTACT = "cleanfit.app01@gmail.com";

/** Informativa breve, in italiano semplice. Da aggiornare se cambiano i servizi usati dall'app. */
export default function PrivacyPage() {
  return (
    <div className="pb-10">
      <PrivacyBackLink />
      <PageHeader title="Privacy" subtitle="Ultimo aggiornamento: 2 novembre 2026" />

      <div className="space-y-8 text-[15px] leading-relaxed">
        <Section title="Chi gestisce l’app">
          <p>
            Clean Fit è un’app gratuita gestita da Andrea Santonocito. Per qualsiasi domanda sui tuoi dati scrivi a{" "}
            <a href={`mailto:${CONTACT}`} className="font-medium underline underline-offset-2">
              {CONTACT}
            </a>
            .
          </p>
        </Section>

        <Section title="Quali dati raccogliamo">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong className="font-semibold">Email e password</strong>, per il tuo account. La password è salvata in
              forma cifrata: nessuno può leggerla, nemmeno chi gestisce l’app.
            </li>
            <li>
              <strong className="font-semibold">Le foto dei tuoi capi</strong> e i loro dati: categoria, gruppi, colore,
              note, preferiti, capi da lavare.
            </li>
            <li>
              <strong className="font-semibold">Gli outfit e lo storico</strong>: quali capi hai indossato e in che
              giorno.
            </li>
          </ul>
          <p>
            Ci si registra solo su invito: chi gestisce l’app vede l’indirizzo email di chi si è registrato con un
            suo invito e la data della registrazione.
          </p>
          <p>
            Non raccogliamo la posizione, i contatti né altri dati del telefono. L’app non usa cookie pubblicitari né
            strumenti di statistica. Sul telefono restano solo le impostazioni dell’app (per esempio il tema) e quanto
            serve per restare collegati.
          </p>
        </Section>

        <Section title="Dove sono conservati e chi li tratta">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong className="font-semibold">Supabase</strong> conserva account, dati dei capi, outfit e foto su
              server a Francoforte, in Germania (Unione Europea). Ogni persona può vedere solo i propri dati, e le foto
              non hanno indirizzi pubblici.
            </li>
            <li>
              <strong className="font-semibold">Vercel</strong> ospita l’app e la consegna al tuo telefono; registra
              dati tecnici delle visite, come l’indirizzo IP.
            </li>
            <li>
              <strong className="font-semibold">Brevo</strong> spedisce le email con i codici (verifica dell’account e
              recupero della password); per farlo riceve il tuo indirizzo email.
            </li>
            <li>
              <strong className="font-semibold">img.ly</strong> fornisce il programma che toglie lo sfondo alle foto.
              Il telefono lo scarica dai loro server, che vedono quindi l’indirizzo IP; le tue foto invece non lasciano
              il telefono durante lo scontorno: vengono elaborate sul dispositivo e caricate solo su Supabase.
            </li>
          </ul>
          <p>Questi servizi trattano i dati solo per far funzionare l’app.</p>
        </Section>

        <Section title="Cosa non facciamo">
          <p>
            I tuoi dati non vengono venduti, ceduti ad altri né usati per pubblicità o profilazione. Le foto servono
            solo a mostrarti il tuo armadio.
          </p>
        </Section>

        <Section title="Per quanto tempo">
          <p>Conserviamo i dati finché hai l’account. Quando lo elimini, spariscono con lui.</p>
        </Section>

        <Section title="Come eliminare l’account e tutti i dati">
          <p>
            Nell’app apri <strong className="font-semibold">Profilo → Elimina account</strong> e conferma con “Elimina
            tutto”. Vengono cancellati subito l’account, tutti i capi, le foto, gli outfit e lo storico. Non si può
            annullare.
          </p>
          <p>
            Se non riesci più ad accedere, scrivi a{" "}
            <a href={`mailto:${CONTACT}`} className="font-medium underline underline-offset-2">
              {CONTACT}
            </a>{" "}
            dall’indirizzo del tuo account e lo eliminiamo noi.
          </p>
        </Section>

        <Section title="I tuoi diritti">
          <p>
            Puoi chiedere in ogni momento di vedere, correggere, scaricare o cancellare i tuoi dati scrivendo a{" "}
            <a href={`mailto:${CONTACT}`} className="font-medium underline underline-offset-2">
              {CONTACT}
            </a>
            . Se pensi che i tuoi dati non siano trattati correttamente, puoi rivolgerti al Garante per la protezione dei
            dati personali.
          </p>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h2 className="text-[17px] font-semibold">{title}</h2>
      {children}
    </section>
  );
}
