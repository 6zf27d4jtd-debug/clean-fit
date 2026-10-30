"use client";

import { HeartIcon } from "@/components/icons";

/** Foto di un capo (3:4, fondo avorio già nella foto) con il cuoricino dei preferiti. */
export function ItemCard({
  photoUrl,
  favorite,
  onToggleFavorite,
  label,
}: {
  photoUrl: string | undefined;
  favorite: boolean;
  onToggleFavorite: () => void;
  label: string;
}) {
  return (
    <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-surface-muted">
      {photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- link firmato di Supabase, già compresso
        <img src={photoUrl} alt={label} loading="lazy" decoding="async" className="h-full w-full object-cover" />
      )}
      <FavoriteButton favorite={favorite} onToggle={onToggleFavorite} className="absolute top-0 right-0" />
    </div>
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
