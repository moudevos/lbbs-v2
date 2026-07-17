const panelAccessRoles = new Set(["owner", "admin", "reception"]);

export function canHavePanelAccess(role: string | null | undefined) {
  return typeof role === "string" && panelAccessRoles.has(role);
}
