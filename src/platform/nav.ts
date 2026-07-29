import type { Role } from "@/mock/types";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  label: string;
  to: string;
  params?: Record<string, string>;
  roles?: Role[];
  badge?: number;
}

export interface NavSubGroup {
  label: string;
  items: NavItem[];
}

export interface NavSection {
  id: string;
  label: string;
  icon: LucideIcon;
  to?: string;
  roles?: Role[];
  /** Flat list (max ~8 items) OR labelled sub-groups when it grows beyond that. */
  items?: NavItem[];
  groups?: NavSubGroup[];
}

export interface ModuleDefinition {
  id: string;
  name: string;
  shortName: string;
  sections: NavSection[];
}