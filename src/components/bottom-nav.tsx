"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NEW_PASSWORD_PATH, useUser } from "@/components/auth-provider";
import { HangerIcon, PlusIcon, SparkleIcon, TagIcon, UserIcon } from "@/components/icons";

const TABS = [
  { href: "/", label: "Armadio", Icon: HangerIcon },
  { href: "/gruppi", label: "Gruppi", Icon: TagIcon },
  { href: "/aggiungi", label: "Aggiungi", Icon: PlusIcon, primary: true },
  { href: "/outfit", label: "Outfit", Icon: SparkleIcon },
  { href: "/profilo", label: "Profilo", Icon: UserIcon },
];

function isActive(pathname: string, href: string) {
  return href === "/"
    ? pathname === "/" || ["/categoria", "/categorie", "/capo"].some((prefix) => pathname.startsWith(prefix))
    : pathname.startsWith(href);
}

export function BottomNav() {
  const pathname = usePathname();
  const user = useUser();
  // Durante il recupero della password si resta sulla pagina "Nuova password": niente schede
  if (!user || pathname === NEW_PASSWORD_PATH) return null;

  return (
    <nav
      aria-label="Navigazione principale"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-background/85 backdrop-blur-xl"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto grid h-16 max-w-md grid-cols-5 px-2">
        {TABS.map(({ href, label, Icon, primary }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href} className="flex">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                  active ? "text-foreground" : "text-muted"
                }`}
              >
                {primary ? (
                  <span className="flex size-12 items-center justify-center rounded-full bg-foreground text-background shadow-sm transition-transform active:scale-95">
                    <Icon width={26} height={26} strokeWidth={2} />
                    <span className="sr-only">{label}</span>
                  </span>
                ) : (
                  <>
                    <Icon strokeWidth={active ? 2.1 : 1.7} />
                    <span>{label}</span>
                  </>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
