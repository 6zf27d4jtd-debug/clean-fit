import type { CategoryRole } from "@/lib/categories";

export type Category = {
  id: string;
  name: string;
  role: CategoryRole;
  position: number;
};

export type Profile = {
  id: string;
  recent_days: number;
};

export type Grouping = {
  id: string;
  name: string;
  position: number;
};

export type Item = {
  id: string;
  category_id: string;
  front_path: string;
  back_path: string | null;
  color: string | null;
  notes: string | null;
  favorite: boolean;
  created_at: string;
  /** Vuota se il capo è pulito; altrimenti il momento in cui è finito nel cesto. */
  in_laundry_since: string | null;
};
