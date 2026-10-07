# RouterOS v7. Credentials are never written to logs.
:global LBBS_API_BASE_URL
:global LBBS_ROUTER_TOKEN
:global LBBS_HOTSPOT_SERVER_NAME
:global LBBS_HOTSPOT_USER_PROFILE
:local headers ("Content-Type: application/json,Authorization: Bearer " . $LBBS_ROUTER_TOKEN)
:local ackUrl ($LBBS_API_BASE_URL . "/api/wifi/router/ack")
:local ack do={ :do { /tool fetch url=$ackUrl http-method=post http-header-field=$headers http-data=[:serialize to=json value=$1] check-certificate=yes output=none } on-error={ :log warning "LBBS: ACK pendiente" } }
:do {
 :local fetch [/tool fetch url=($LBBS_API_BASE_URL . "/api/wifi/router/pull") http-method=post http-header-field=$headers http-data="{}" check-certificate=yes output=user as-value]
 :local response [:deserialize from=json value=($fetch->"data")]
 :foreach command in=($response->"commands") do={
  :local id ($command->"id"); :local type ($command->"type"); :local voucherId ($command->"voucherId")
  :local ok false; :local errorCode "unsupported_command"; :local errorMessage "Comando no compatible."; :local result {}
  :do {
   :local tag ("LBBS:" . $voucherId)
   :if ($type = "CREATE_VOUCHER") do={
    :local username ($command->"username"); :local password ($command->"password"); :local found [/ip hotspot user find where comment=$tag]
    :if ([:len $found] = 0) do={ /ip hotspot user add name=$username password=$password server=$LBBS_HOTSPOT_SERVER_NAME profile=$LBBS_HOTSPOT_USER_PROFILE disabled=yes comment=$tag } else={ /ip hotspot user set $found name=$username password=$password server=$LBBS_HOTSPOT_SERVER_NAME profile=$LBBS_HOTSPOT_USER_PROFILE disabled=yes comment=$tag }
    :set result {"routerUserId"=$username}; :set ok true
   }
   :if ($type = "ACTIVATE_VOUCHER") do={ :local found [/ip hotspot user find where comment=$tag]; :local mac (($command->"payload")->"mac"); :if ([:len $found] = 0) do={ :error "voucher_missing" }; /ip hotspot user set $found mac-address=$mac disabled=no; :set ok true }
   :if (($type = "REVOKE_VOUCHER") || ($type = "EXPIRE_VOUCHER")) do={ :local found [/ip hotspot user find where comment=$tag]; :foreach u in=$found do={ :local n [/ip hotspot user get $u name]; :local bound [/ip hotspot user get $u mac-address]; /ip hotspot active remove [find where user=$n]; :if ([:len $bound] > 0) do={ /ip hotspot cookie remove [find where mac-address=$bound] }; /ip hotspot user remove $u }; :set ok true }
   :if ($ok) do={ :set errorCode ""; :set errorMessage "" }
  } on-error={ :set errorCode "router_command_failed"; :set errorMessage "No se pudo aplicar el comando." }
  :if ($ok) do={ $ack {"commandId"=$id;"success"=true;"result"=$result} } else={ $ack {"commandId"=$id;"success"=false;"errorCode"=$errorCode;"errorMessage"=$errorMessage} }
 }
} on-error={ :log warning "LBBS: sincronizaciÃ³n fallida" }
