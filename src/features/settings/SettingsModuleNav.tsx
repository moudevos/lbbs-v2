"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/free-solid-svg-icons";
import {
  faLayerGroup,
  faSackDollar,
  faCommentDots,
} from "@fortawesome/free-solid-svg-icons";

export type SettingsModuleKey = "catalogs" | "compensation" | "whatsapp";

type ModuleTab = { key: SettingsModuleKey; label: string; icon: IconDefinition };

const moduleTabs: ModuleTab[] = [
  { key: "catalogs", label: "Catalogos", icon: faLayerGroup },
  { key: "compensation", label: "Compensacion", icon: faSackDollar },
  { key: "whatsapp", label: "Plantillas", icon: faCommentDots },
];

type SettingsModuleNavProps = {
  active: SettingsModuleKey;
  onChange: (key: SettingsModuleKey) => void;
};

export function SettingsModuleNav({ active, onChange }: SettingsModuleNavProps) {
  return (
    <nav className="flex items-center gap-6 border-b border-slate-200">
      {moduleTabs.map((tab) => {
        const isActive = tab.key === active;

        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className="group relative flex flex-col items-center gap-1.5 pb-3 pt-1"
          >
            <span className="relative flex h-8 w-8 items-center justify-center">
              {isActive ? (
                <span className="absolute inset-0 rounded-full bg-emerald-100" />
              ) : null}
              <FontAwesomeIcon
                icon={tab.icon}
                className={[
                  "relative h-4 w-4 transition",
                  isActive ? "text-emerald-600" : "text-slate-300 group-hover:text-slate-400",
                ].join(" ")}
              />
            </span>

            <span
              className={[
                "text-sm font-semibold transition",
                isActive ? "text-emerald-600" : "text-slate-400 group-hover:text-slate-500",
              ].join(" ")}
            >
              {tab.label}
            </span>

            <span
              className={[
                "absolute -bottom-px h-0.5 w-full rounded-full transition",
                isActive ? "bg-emerald-500" : "bg-transparent",
              ].join(" ")}
            />
          </button>
        );
      })}
    </nav>
  );
}