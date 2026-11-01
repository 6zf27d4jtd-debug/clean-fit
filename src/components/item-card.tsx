"use client";

import Link from "next/link";
import { BasketIcon, HeartIcon } from "@/components/icons";

/**
 * Foto di un capo (3:4, fondo avorio già nella foto) con il cuoricino dei preferiti e, se richiesto,
 * il pulsante del cesto. Un capo da lavare ha la foto attenuata e l'etichetta "Da lavare".
 */
export function ItemCard({
  href,
  photoUrl,
  favorite,
  onToggleFavorite,
  inLaundry = false,
  onToggleLaundry,
  label,
}: {
  href: string;
  photoUrl: string | undefined;
  favorite?: boolean;
  onToggleFavorite?: () => void;
  inLaundry?: boolean;
  onToggleLaundry?: () => void;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="relative block aspect-[3/4] overflow-hidden rounded-2xl bg-surface-muted transition-transform active:scale-[0.98]"
    >
      {photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- link firmato di Supabase, già compresso
        <img
          src={photoUrl}
          alt={label}
          loading="lazy"
          decoding="async"
          className={`h-full w-full object-cover ${inLaundry ? "opacity-60" : ""}`}
        />
      )}
      {inLaundry && <LaundryLabel className="absolute bottom-2 left-2" />}
      {onToggleLaundry && (
        <LaundryButton inLaundry={inLaundry} onToggle={onToggleLaundry} className="absolute top-0 left-0" />
      )}
      {onToggleFavorite && (
        <FavoriteButton favorite={!!favorite} onToggle={onToggleFavorite} className="absolute top-0 right-0" />
      )}
    </Link>
  );
}

export function FavoriteButton({
  favorite,
  onToggle,
  className = "",
}: {
  favorite: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={favorite}
      aria-label={favorite ? "Togli dai preferiti" : "Aggiungi ai preferiti"}
      onClick={(event) => {
        // Le schede possono stare dentro un link: il cuoricino non deve aprire il capo
        event.preventDefault();
        event.stopPropagation();
        onToggle();
      }}
      className={`flex size-11 items-center justify-center ${className}`}
    >
      {/* Le foto hanno sempre il fondo avorio: il cuore resta scuro anche nel tema scuro */}
      <span className="flex size-8 items-center justify-center rounded-full bg-white/70 text-neutral-900 backdrop-blur-sm">
        <HeartIcon filled={favorite} width={18} height={18} strokeWidth={1.9} />
      </span>
    </button>
  );
}

/** Etichetta sulle foto dei capi nel cesto; come il cuore, resta chiara anche nel tema scuro (fondo avorio). */
export function LaundryLabel({ className = "" }: { className?: string }) {
  return (
    <span
      className={`rounded-full bg-white/85 px-2 py-0.5 text-[11px] font-medium text-neutral-900 backdrop-blur-sm ${className}`}
    >
      Da lavare
    </span>
  );
}

export function LaundryButton({
  inLaundry,
  onToggle,
  className = "",
}: {
  inLaundry: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={inLaundry}
      aria-label={inLaundry ? "Togli dal cesto: lavato" : "Metti nel cesto"}
      onClick={(event) => {
        // Le schede stanno dentro un link: il pulsante non deve aprire il capo
        event.preventDefault();
        event.stopPropagation();
        onToggle();
      }}
      className={`flex size-11 items-center justify-center ${className}`}
    >
      <span className="flex size-8 items-center justify-center rounded-full bg-white/70 text-neutral-900 backdrop-blur-sm">
        <BasketIcon filled={inLaundry} width={18} height={18} strokeWidth={1.9} />
      </span>
    </button>
  );
}
