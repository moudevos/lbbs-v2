# Installs/updates the LBBS command synchronization script on RouterOS v7.
/system script remove [find where name="lbbs-sync"]
/system script add name="lbbs-sync" policy=ftp,read,write,policy,test,sensitive source={
  :global lbbsApiBaseUrl
  :global lbbsRouterToken
  :global lbbsHotspotServerName
  :global lbbsHotspotUserProfile

  :if ([:len $lbbsApiBaseUrl] = 0 || [:len $lbbsRouterToken] = 0) do={
    :log warning "LBBS: sync sin configuracion"
    :error "lbbs_not_configured"
  }

  :local headers ("Content-Type: application/json,Authorization: Bearer " . $lbbsRouterToken)
  :local ackUrl ($lbbsApiBaseUrl . "/api/wifi/router/ack")
  :local ack do={
    :do {
      /tool fetch url=$ackUrl http-method=post http-header-field=$headers http-data=[:serialize to=json value=$1] check-certificate=yes output=none
    } on-error={
      :log warning "LBBS: ACK pendiente"
    }
  }

  :do {
    :local fetched [/tool fetch url=($lbbsApiBaseUrl . "/api/wifi/router/pull") http-method=post http-header-field=$headers http-data="{}" check-certificate=yes output=user as-value]
    :local response [:deserialize from=json value=($fetched->"data")]

    :foreach command in=($response->"commands") do={
      :local id ($command->"id")
      :local commandType ($command->"type")
      :local voucherId ($command->"voucherId")
      :local ok false
      :local errorCode "unsupported_command"
      :local errorMessage "Comando no compatible."
      :local result {}
      :local tag ("LBBS:" . $voucherId)

      :do {
        :if ($commandType = "CREATE_VOUCHER") do={
          :local username ($command->"username")
          :local password ($command->"password")
          :local found [/ip hotspot user find where comment=$tag]

          :if ([:len $found] = 0) do={
            /ip hotspot user add name=$username password=$password server=$lbbsHotspotServerName profile=$lbbsHotspotUserProfile disabled=yes comment=$tag
          } else={
            /ip hotspot user set $found name=$username password=$password server=$lbbsHotspotServerName profile=$lbbsHotspotUserProfile disabled=yes comment=$tag
          }

          :set result {"routerUserId"=$username}
          :set ok true
        }

        :if ($commandType = "ACTIVATE_VOUCHER") do={
          :local found [/ip hotspot user find where comment=$tag]
          :local clientMac (($command->"payload")->"mac")
          :if ([:len $found] = 0) do={ :error "voucher_missing" }
          /ip hotspot user set $found mac-address=$clientMac disabled=no
          :set ok true
        }

        :if (($commandType = "REVOKE_VOUCHER") || ($commandType = "EXPIRE_VOUCHER")) do={
          :local found [/ip hotspot user find where comment=$tag]
          :foreach userId in=$found do={
            :local hotspotUser [/ip hotspot user get $userId name]
            :local boundMac [/ip hotspot user get $userId mac-address]
            /ip hotspot active remove [find where user=$hotspotUser]
            :if ([:len $boundMac] > 0) do={ /ip hotspot cookie remove [find where mac-address=$boundMac] }
          }
          :foreach userId in=[/ip hotspot user find where comment=$tag] do={ /ip hotspot user remove $userId }
          :set ok true
        }

        :if ($ok) do={
          :set errorCode ""
          :set errorMessage ""
        }
      } on-error={
        :set errorCode "router_command_failed"
        :set errorMessage "No se pudo aplicar el comando."
      }

      :if ($ok) do={
        $ack {"commandId"=$id;"success"=true;"result"=$result}
      } else={
        $ack {"commandId"=$id;"success"=false;"errorCode"=$errorCode;"errorMessage"=$errorMessage}
      }
    }
  } on-error={
    :log warning "LBBS: sincronizacion fallida"
  }
}
