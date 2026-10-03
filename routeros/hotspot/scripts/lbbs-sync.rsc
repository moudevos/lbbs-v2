# Requires RouterOS v7 with :deserialize from=json and :serialize to=json.
# Older RouterOS must be upgraded; no custom JSON parser is supplied.
:global LBBS_API_BASE_URL
:global LBBS_ROUTER_TOKEN
:global LBBS_HOTSPOT_SERVER_NAME
:global LBBS_HOTSPOT_PROFILE_NAME
:local headers ("Content-Type: application/json,Authorization: Bearer " . $LBBS_ROUTER_TOKEN)
:local pullUrl ($LBBS_API_BASE_URL . "/api/wifi/router/pull")
:local ackUrl ($LBBS_API_BASE_URL . "/api/wifi/router/ack")
:local sendAck do={ :do { /tool fetch url=$ackUrl http-method=post http-header-field=$headers http-data=[:serialize to=json value=$1] check-certificate=yes output=none } on-error={ :log warning "LBBS sync: ACK delivery failed" } }
:log info "LBBS sync started"
:do {
  :local pullResult [/tool fetch url=$pullUrl http-method=post http-header-field=$headers http-data="{}" check-certificate=yes output=user as-value]
  :local response [:deserialize from=json value=($pullResult->"data")]
  :foreach command in=($response->"commands") do={
    :local commandId ($command->"id"); :local commandType ($command->"type")
    :local ok false; :local result {}; :local errorCode "unsupported_command"; :local errorMessage "Comando no compatible."
    :if ($commandType = "CREATE_VOUCHER") do={
      :local voucherId ($command->"voucherId"); :local username ($command->"username"); :local password ($command->"password"); :local comment ("LBBS:" . $voucherId)
      :do {
        :local existing [/ip hotspot user find where name=$username]
        :if ([:len $existing] = 0) do={ /ip hotspot user add name=$username password=$password server=$LBBS_HOTSPOT_SERVER_NAME profile=$LBBS_HOTSPOT_PROFILE_NAME disabled=yes comment=$comment } else={ /ip hotspot user set $existing password=$password server=$LBBS_HOTSPOT_SERVER_NAME profile=$LBBS_HOTSPOT_PROFILE_NAME disabled=yes comment=$comment }
        :set ok true; :set errorCode ""; :set errorMessage ""; :set result {"routerUserId"=$username}; :log info ("LBBS command applied: " . $commandId)
      } on-error={ :set errorCode "create_failed"; :set errorMessage "No se pudo crear el acceso."; :log warning ("LBBS command failed: " . $commandId) }
    }
    :if ($ok) do={ $sendAck {"commandId"=$commandId;"success"=true;"result"=$result} } else={ $sendAck {"commandId"=$commandId;"success"=false;"errorCode"=$errorCode;"errorMessage"=$errorMessage} }
    # Reserved handlers: no user activation occurs before Part 4.
    :if ($commandType = "ACTIVATE_VOUCHER") do={ :log info "LBBS ACTIVATE_VOUCHER deferred to Part 4" }
    :if ($commandType = "REVOKE_VOUCHER") do={ :log info "LBBS REVOKE_VOUCHER handler reserved" }
    :if ($commandType = "EXPIRE_VOUCHER") do={ :log info "LBBS EXPIRE_VOUCHER handler reserved" }
  }
} on-error={ :log warning "LBBS sync failed" }
