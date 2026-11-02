import { InviteManager } from "@/components/invite-manager";
import { BackLink, PageHeader } from "@/components/page-header";

export default function InvitaPage() {
  return (
    <>
      <BackLink href="/profilo" label="Profilo" />
      <PageHeader title="Invita amici" subtitle="Link per registrarsi a Clean Fit" />
      <InviteManager />
    </>
  );
}
