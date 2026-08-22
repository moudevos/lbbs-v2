"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Swal from "sweetalert2";

import { SettingFormModal } from "@/features/settings/SettingFormModal";
import { SettingTable } from "@/features/settings/SettingTable";
import { settingsTabs, type SettingsTabId } from "@/features/settings/SettingsUnifiedNav";
import { CompensationRulesPanel, type CompensationKind } from "@/features/settings/CompensationRulesPanel";
import { RewardsConfigurationSummary } from "@/features/settings/RewardsConfigurationSummary";
import { WhatsAppTemplatesPanel } from "@/features/settings/WhatsAppTemplatesPanel";
import { InternalBenefitsPanel } from "@/features/settings/InternalBenefitsPanel";
import { CourtesyRulesPanel } from "@/features/settings/CourtesyRulesPanel";
import {
  createEmptySettingForm,
  fetchSettings,
  saveSetting,
  toSettingFormValue,
  toggleSetting,
  validateDuplicate,
} from "@/features/settings/settings-actions";
import {
  settingsSections,
  type SettingFormValue,
  type SettingRecord,
  type SettingsSectionConfig,
  type SettingsSectionKey,
} from "@/features/settings/settings-types";

type SettingsMap = Partial<Record<SettingsSectionKey, SettingRecord[]>>;
type LoadingMap = Partial<Record<SettingsSectionKey, boolean>>;

function getSectionConfig(section: SettingsSectionKey) {
  const config = settingsSections.find((item) => item.key === section);

  if (!config) {
    throw new Error("Seccion de configuracion no encontrada.");
  }

  return config;
}

function getToggleText(config: SettingsSectionConfig, item: SettingRecord) {
  if (config.key === "payment_methods" && item.is_active) {
    return "El metodo dejara de aparecer en nuevas ventas del POS, pero se conserva en ventas historicas.";
  }

  return item.is_active
    ? "El registro quedara inactivo para nuevas operaciones."
    : "El registro volvera a estar disponible en operacion.";
}

export function SettingsPageClient() {
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const activeTab: SettingsTabId = settingsTabs.some((tab) => tab.id === requestedTab)
    ? (requestedTab as SettingsTabId)
    : "cat:service_categories";
  const [itemsBySection, setItemsBySection] = useState<SettingsMap>({});
  const [loadingBySection, setLoadingBySection] = useState<LoadingMap>({});
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SettingFormValue>(createEmptySettingForm());

  const activeSection: SettingsSectionKey | null = activeTab.startsWith("cat:")
    ? (activeTab.slice(4) as SettingsSectionKey)
    : null;
  const activeCompensationKind: CompensationKind | null = activeTab.startsWith("comp:")
    ? (activeTab.slice(5) as CompensationKind)
    : null;

  const activeConfig = useMemo(
    () => (activeSection ? getSectionConfig(activeSection) : null),
    [activeSection],
  );
  const activeItems = activeSection ? itemsBySection[activeSection] ?? [] : [];
  const isLoading = activeSection ? loadingBySection[activeSection] ?? false : false;

  async function loadSection(section: SettingsSectionKey) {
    setLoadingBySection((current) => ({ ...current, [section]: true }));

    try {
      const data = await fetchSettings(section);
      setItemsBySection((current) => ({ ...current, [section]: data }));
    } finally {
      setLoadingBySection((current) => ({ ...current, [section]: false }));
    }
  }

  async function loadAllSections() {
    const loadingState = settingsSections.reduce<LoadingMap>((acc, section) => {
      acc[section.key] = true;
      return acc;
    }, {});

    setLoadingBySection(loadingState);

    try {
      const results = await Promise.all(
        settingsSections.map(async (section) => {
          const data = await fetchSettings(section.key);
          return [section.key, data] as const;
        }),
      );

      setItemsBySection(
        results.reduce<SettingsMap>((acc, [section, data]) => {
          acc[section] = data;
          return acc;
        }, {}),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudieron cargar las configuraciones.";
      console.error("[settings/ui] Error al cargar configuraciones", { message });
      await Swal.fire({
        icon: "error",
        title: "No se pudieron cargar las configuraciones",
        text: message,
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
    } finally {
      setLoadingBySection({});
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadAllSections();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  function openCreate() {
    setEditingId(null);
    setForm(createEmptySettingForm());
    setIsModalOpen(true);
  }

  function openEdit(item: SettingRecord) {
    if (!activeConfig) return;
    setEditingId(item.id);
    setForm(toSettingFormValue(activeConfig, item));
    setIsModalOpen(true);
  }

  async function handleSave() {
    if (!activeConfig || !activeSection) return;

    if (!form.name.trim()) {
      await Swal.fire({
        icon: "warning",
        title: "Falta el nombre",
        text: "Ingresa un nombre para continuar.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      return;
    }

    if (!form.identity.trim() && !form.name.trim()) {
      await Swal.fire({
        icon: "warning",
        title: `Falta ${activeConfig.identityLabel.toLowerCase()}`,
        text: `Ingresa un ${activeConfig.identityLabel.toLowerCase()} valido para continuar.`,
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      return;
    }

    const duplicateError = validateDuplicate(activeConfig, activeItems, form, editingId);
    if (duplicateError) {
      await Swal.fire({
        icon: "warning",
        title: "Registro duplicado",
        text: duplicateError,
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      return;
    }

    setIsSaving(true);

    try {
      await saveSetting(activeConfig, form, editingId);
      await Swal.fire({
        icon: "success",
        title: editingId ? "Configuracion actualizada" : "Configuracion creada",
        text: editingId
          ? "Los cambios quedaron guardados."
          : "El registro quedo disponible en la configuracion operativa.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });

      setIsModalOpen(false);
      setEditingId(null);
      setForm(createEmptySettingForm());
      await loadSection(activeSection);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudo guardar la configuracion.";
      console.error("[settings/ui] Error al guardar configuracion", {
        message,
        section: activeSection,
      });
      await Swal.fire({
        icon: "error",
        title: "No se pudo guardar la configuracion",
        text: message,
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleActive(item: SettingRecord) {
    if (!activeConfig || !activeSection) return;

    const result = await Swal.fire({
      icon: "question",
      title: item.is_active ? "Desactivar registro" : "Activar registro",
      text: getToggleText(activeConfig, item),
      showCancelButton: true,
      confirmButtonText: item.is_active ? "Desactivar" : "Activar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#0f766e",
      background: "#ffffff",
      color: "#0f172a",
    });

    if (!result.isConfirmed) {
      return;
    }

    try {
      await toggleSetting(activeConfig, item, !item.is_active);
      await loadSection(activeSection);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudo actualizar el estado.";
      console.error("[settings/ui] Error al cambiar estado", {
        message,
        section: activeSection,
        id: item.id,
      });
      await Swal.fire({
        icon: "error",
        title: "No se pudo actualizar el estado",
        text: message,
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
    }
  }

  return (
    <>
      <div className="space-y-4">
        {activeSection && activeConfig ? (
          <SettingTable
            config={activeConfig}
            items={activeItems}
            isLoading={isLoading}
            onCreate={openCreate}
            onEdit={openEdit}
            onToggleActive={handleToggleActive}
          />
        ) : null}

        {activeCompensationKind ? (
          <CompensationRulesPanel kind={activeCompensationKind} />
        ) : null}

        {activeTab === "rewards" ? <RewardsConfigurationSummary /> : null}

        {activeTab === "whatsapp" ? <WhatsAppTemplatesPanel /> : null}

        {activeTab === "internal-benefits" ? <InternalBenefitsPanel /> : null}

        {activeTab === "courtesy-rules" ? <CourtesyRulesPanel /> : null}
      </div>

      {activeConfig ? (
        <SettingFormModal
          open={isModalOpen}
          config={activeConfig}
          value={form}
          isSaving={isSaving}
          isEditing={Boolean(editingId)}
          onClose={() => setIsModalOpen(false)}
          onChange={setForm}
          onSubmit={handleSave}
        />
      ) : null}
    </>
  );
}
