# LBBS fase 1: instalar eventos LOGIN / LOGOUT en el perfil de clientes.
# No modifica la WAN, el firewall ni las credenciales del router.
# Requiere que lbbsApiBaseUrl y lbbsRouterToken ya estén configurados por la instalación actual.

:global lbbsApiBaseUrl
:global lbbsRouterToken
:if ([:len $lbbsApiBaseUrl] = 0 || [:len $lbbsRouterToken] = 0) do={
  :error "LBBS: faltan las variables de API y token del router"
}

:local onLoginSource ":global lbbsApiBaseUrl;:global lbbsRouterToken;:local lbbsUser \$user;:local lbbsMac \$\"mac-address\";:local lbbsIp \$address;:local lbbsUserId [/ip hotspot user find where name=\$lbbsUser];:if ([:len \$lbbsUserId] > 0) do={:local lbbsTag [/ip hotspot user get \$lbbsUserId comment];:if ([:pick \$lbbsTag 0 5] = \"LBBS:\") do={:local lbbsVoucherId [:pick \$lbbsTag 5 [:len \$lbbsTag]];:local lbbsPayload {\"voucherId\"=\$lbbsVoucherId;\"mac\"=\$lbbsMac;\"ip\"=\$lbbsIp;\"event\"=\"LOGIN\";\"metadata\"={\"router\"=\"RouterOS\"}};:do {/tool fetch url=(\$lbbsApiBaseUrl . \"/api/wifi/router/session\") http-method=post http-header-field=(\"Content-Type: application/json,Authorization: Bearer \" . \$lbbsRouterToken) http-data=[:serialize to=json value=\$lbbsPayload] check-certificate=yes output=none} on-error={:log warning \"LBBS: LOGIN no enviado\"}}}}"
:local onLogoutSource ":global lbbsApiBaseUrl;:global lbbsRouterToken;:local lbbsUser \$user;:local lbbsMac \$\"mac-address\";:local lbbsIp \$address;:local lbbsCause \$cause;:local lbbsUserId [/ip hotspot user find where name=\$lbbsUser];:if ([:len \$lbbsUserId] > 0) do={:local lbbsTag [/ip hotspot user get \$lbbsUserId comment];:if ([:pick \$lbbsTag 0 5] = \"LBBS:\") do={:local lbbsVoucherId [:pick \$lbbsTag 5 [:len \$lbbsTag]];/ip hotspot cookie remove [find where mac-address=\$lbbsMac];/ip hotspot user remove \$lbbsUserId;:local lbbsPayload {\"voucherId\"=\$lbbsVoucherId;\"mac\"=\$lbbsMac;\"ip\"=\$lbbsIp;\"event\"=\"LOGOUT\";\"metadata\"={\"reason\"=\$lbbsCause}};:do {/tool fetch url=(\$lbbsApiBaseUrl . \"/api/wifi/router/session\") http-method=post http-header-field=(\"Content-Type: application/json,Authorization: Bearer \" . \$lbbsRouterToken) http-data=[:serialize to=json value=\$lbbsPayload] check-certificate=yes output=none} on-error={:log warning \"LBBS: LOGOUT no enviado; acceso invalidado localmente\"}}}}"

:local userProfileId [/ip hotspot user profile find where name="lbbs-client-profile"]
:if ([:len $userProfileId] = 0) do={ :error "LBBS: lbbs-client-profile no existe" }
/ip hotspot user profile set $userProfileId shared-users=1 idle-timeout=none keepalive-timeout=3m session-timeout=3h add-mac-cookie=yes mac-cookie-timeout=3h on-login=$onLoginSource on-logout=$onLogoutSource
# Reconciliación inicial: detecta sesiones LBBS ya activas (los hooks no se disparan
# retroactivamente). No desconecta al cliente ni revela el código de acceso.
:local lbbsSessionUrl ($lbbsApiBaseUrl . "/api/wifi/router/session")
:local lbbsHeaders ("Content-Type: application/json,Authorization: Bearer " . $lbbsRouterToken)
:foreach lbbsActiveId in=[/ip hotspot active find where server="lbbs-hotspot"] do={
  :local lbbsActiveUser [/ip hotspot active get $lbbsActiveId user]
  :local lbbsMac [:tostr [/ip hotspot active get $lbbsActiveId mac-address]]
  :local lbbsIp [:tostr [/ip hotspot active get $lbbsActiveId address]]
  :local lbbsLocalUserId [/ip hotspot user find where name=$lbbsActiveUser]
  :if ([:len $lbbsLocalUserId] > 0) do={
    :local lbbsTag [/ip hotspot user get $lbbsLocalUserId comment]
    :if ([:pick $lbbsTag 0 5] = "LBBS:") do={
      :local lbbsVoucherId [:pick $lbbsTag 5 [:len $lbbsTag]]
      :local lbbsPayload {"voucherId"=$lbbsVoucherId;"mac"=$lbbsMac;"ip"=$lbbsIp;"event"="LOGIN";"metadata"={"source"="hook_install_reconciliation"}}
      :do {
        /tool fetch url=$lbbsSessionUrl http-method=post http-header-field=$lbbsHeaders http-data=[:serialize to=json value=$lbbsPayload] check-certificate=yes output=none
        :log info "LBBS: sesion activa reconciliada"
      } on-error={
        :log warning "LBBS: reconciliacion de sesion pendiente"
      }
    }
  }
}
:log info "LBBS: hooks LOGIN/LOGOUT instalados en lbbs-client-profile"
