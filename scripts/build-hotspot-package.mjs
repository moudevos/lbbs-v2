import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "routeros", "hotspot");
const output = path.resolve(root, "..", "..", "MIKROTIK_HOTSPOT_LBBS");

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(path.join(source, "install.rsc.template"), path.join(output, "install.rsc.template"));
await cp(path.join(source, "scripts"), path.join(output, "scripts"), { recursive: true });
await cp(path.join(source, "portal"), path.join(output, "portal"), { recursive: true });
await writeFile(path.join(output, "README.md"), `# MIKROTIK_HOTSPOT_LBBS\n\nArtefacto generado para instalar Red Hotspot LBBS en RouterOS v7. No contiene secretos ni lÃ³gica de negocio principal. La fuente de verdad es \`lbbs_Dash_v2/lbbs-v2/routeros/hotspot\`. Ejecute \`npm run hotspot:package\` desde el dashboard para regenerarlo.\n`);
await writeFile(path.join(output, "CONFIG.example.md"), `# ConfiguraciÃ³n por completar\n\n- Router: MikroTik hEX RB750Gr3\n- RouterOS: ____________\n- WAN: ____________\n- Puerto AP: ____________\n- Subnet Hotspot: ____________\n- Gateway: ____________\n- Pool: ____________\n- DNS name: ____________\n- SSID AP: ____________\n- API LBBS: ____________\n- Router Identifier: ____________\n- Router Token: GENERAR EN DASHBOARD\n- Sync interval: 5s\n- Heartbeat: 30s\n`);
await writeFile(path.join(output, "INSTALL.md"), `# InstalaciÃ³n RouterOS v7\n\n1. Actualiza RouterOS v7 y realiza un backup.\n2. Identifica el puerto/VLAN del AP externo (el hEX no tiene radio WiFi) y la subnet de clientes.\n3. Completa todos los placeholders de \`install.rsc.template\`; no modifiques WAN ni firewall global.\n4. Reemplaza \`{{LBBS_API_BASE_URL}}\` y \`{{LBBS_ROUTER_IDENTIFIER}}\` tambiÃ©n dentro de \`portal/login.html\`; el token no va en el portal.\n5. En WinBox > Files, sube \`portal/\` a \`hotspot/lbbs-portal/\` y cada archivo de \`scripts/\` a Files.\n6. Guarda el template ya completado como \`install.rsc\` y usa Import.\n7. Verifica HotSpot, DHCP, los schedulers \`lbbs-sync\` (5s) y \`lbbs-heartbeat\` (30s), y luego heartbeat en Dashboard.\n8. Genera un cÃ³digo: el usuario debe existir inicialmente disabled.\n9. Abre el portal, valida DNI+cÃ³digo y comprueba que se active, haga login CHAP y tenga Internet.\n10. Desconecta menos de 3 min: debe reconectar con mac-cookie. Desconecta mÃ¡s de 3 min: debe expirar y exigir un cÃ³digo nuevo.\n\nTLS requiere hora correcta, DNS funcional y CA confiable; \`check-certificate=yes\` es obligatorio. Los archivos a subir son \`portal/*\`, \`scripts/lbbs-sync.rsc\`, \`scripts/lbbs-heartbeat.rsc\`, \`scripts/lbbs-session-login.rsc\` y \`scripts/lbbs-session-logout.rsc\`.\n`);
console.log(`Generated ${output}`);
