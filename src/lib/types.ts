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
