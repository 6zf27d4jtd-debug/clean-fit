import { AuthForm } from "@/components/auth-form";

export default function AccediPage() {
  return (
    <div className="flex min-h-[85dvh] flex-col justify-center">
      <div className="mb-10">
        <h1 className="text-[40px] leading-none font-semibold tracking-tight">Clean Fit</h1>
        <p className="mt-2 text-[17px] text-muted">Il tuo armadio, in ordine.</p>
      </div>
      <AuthForm />
    </div>
  );
}
