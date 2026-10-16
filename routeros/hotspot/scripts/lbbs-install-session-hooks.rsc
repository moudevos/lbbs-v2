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
:log info "LBBS: hooks LOGIN/LOGOUT instalados en lbbs-client-profile"
