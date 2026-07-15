"use client";

import { cn } from "@/lib/utils/cn";
import type {
  SettingRecord,
  SettingsSectionConfig,
  SettingsSectionKey,
} from "@/features/settings/settings-types";

type SettingsSectionTabsProps = {
  sections: SettingsSectionConfig[];
  activeSection: SettingsSectionKey;
  itemsBySection: Partial<Record<SettingsSectionKey, SettingRecord[]>>;
  onChange: (section: SettingsSectionKey) => void;
};

export function SettingsSectionTabs({
  sections,
  activeSection,
  itemsBySection,
  onChange,
}: SettingsSectionTabsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {sections.map((section) => {
        const count = itemsBySection[section.key]?.length ?? 0;

        return (
          <button
            key={section.key}
            type="button"
            onClick={() => onChange(section.key)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition",
              activeSection === section.key
                ? "border-sky-200 bg-sky-100 text-sky-700"
                : "border-slate-200 bg-white text-slate-600 hover:border-sky-100 hover:text-sky-700",
            )}
          >
            <span>{section.title}</span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-semibold",
                activeSection === section.key
                  ? "bg-white/80 text-sky-700"
                  : "bg-slate-100 text-slate-500",
              )}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
