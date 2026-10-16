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

  :do {
    :local fetched [/tool fetch url=($lbbsApiBaseUrl . "/api/wifi/router/pull") http-method=post http-header-field=$headers http-data="{}" check-certificate=yes output=user as-value]
    # IMPORTANT: JSON string "098497" MUST stay a string, not 98497.
    :local response [:deserialize from=json options=json.no-string-conversion value=($fetched->"data")]

    :foreach lbbsCommand in=($response->"commands") do={
      :local lbbsCommandId ($lbbsCommand->"id")
      :local lbbsCommandType ($lbbsCommand->"type")
      :local lbbsVoucherId ($lbbsCommand->"voucherId")
      :local lbbsOk false
      :local lbbsErrorCode "unsupported_command"
      :local lbbsErrorMessage "Comando no compatible."
      :local lbbsResult [:toarray ""]
      :local lbbsTag ("LBBS:" . $lbbsVoucherId)

      :do {
        :if ($lbbsCommandType = "CREATE_VOUCHER") do={
          :local lbbsUsername ($lbbsCommand->"username")
          :local lbbsPassword ($lbbsCommand->"password")
          # Guard against lost leading zero and accidental RouterOS JSON coercion.
          :if ([:typeof $lbbsUsername] != "str" || [:len $lbbsUsername] != 6) do={
            :error "voucher_username_format_invalid"
          }
          :if ([:typeof $lbbsPassword] != "str" || [:len $lbbsPassword] != 6 || $lbbsPassword != $lbbsUsername) do={
            :error "voucher_password_format_invalid"
          }
          :local found [/ip hotspot user find where comment=$lbbsTag]

          :if ([:len $found] = 0) do={
            /ip hotspot user add name=$lbbsUsername password=$lbbsPassword server=$lbbsHotspotServerName profile=$lbbsHotspotUserProfile disabled=yes comment=$lbbsTag
          } else={
            /ip hotspot user set $found name=$lbbsUsername password=$lbbsPassword server=$lbbsHotspotServerName profile=$lbbsHotspotUserProfile disabled=yes comment=$lbbsTag
          }

          # Never ACK a created voucher if RouterOS did not preserve all digits.
          :local written [/ip hotspot user find where comment=$lbbsTag]
          :if ([:len $written] != 1) do={ :error "voucher_user_missing_after_create" }
          :if ([:tostr [/ip hotspot user get $written name]] != $lbbsUsername) do={
            :error "voucher_username_changed_by_routeros"
          }
          :if ([:tostr [/ip hotspot user get $written password]] != $lbbsPassword) do={
            :error "voucher_password_changed_by_routeros"
          }
          :set lbbsResult {"routerUserId"=$lbbsUsername}
          :set lbbsOk true
        }

        :if ($lbbsCommandType = "ACTIVATE_VOUCHER") do={
          :local found [/ip hotspot user find where comment=$lbbsTag]
          :local lbbsClientMac (($lbbsCommand->"payload")->"mac")
          :if ([:len $found] = 0) do={ :error "voucher_missing" }
          /ip hotspot user set $found mac-address=$lbbsClientMac disabled=no
          :set lbbsOk true
        }

        :if (($lbbsCommandType = "REVOKE_VOUCHER") || ($lbbsCommandType = "EXPIRE_VOUCHER")) do={
          :local found [/ip hotspot user find where comment=$lbbsTag]
          :foreach userId in=$found do={
            :local hotspotUser [/ip hotspot user get $userId name]
            :local boundMac [/ip hotspot user get $userId mac-address]
            /ip hotspot active remove [find where user=$hotspotUser]
            :if ([:len $boundMac] > 0) do={ /ip hotspot cookie remove [find where mac-address=$boundMac] }
          }
          :foreach userId in=[/ip hotspot user find where comment=$lbbsTag] do={ /ip hotspot user remove $userId }
          :set lbbsOk true
        }

        :if ($lbbsOk) do={
          :set lbbsErrorCode ""
          :set lbbsErrorMessage ""
        }
      } on-error={
        :set lbbsErrorCode "router_command_failed"
        :set lbbsErrorMessage "No se pudo aplicar el comando."
      }

      # Avoid RouterOS local-function scope: ACK uses variables from this script block.
      :local lbbsAckPayload
      :if ($lbbsOk) do={
        :set lbbsAckPayload {"commandId"=$lbbsCommandId;"success"=true;"result"=$lbbsResult}
      } else={
        :set lbbsAckPayload {"commandId"=$lbbsCommandId;"success"=false;"errorCode"=$lbbsErrorCode;"errorMessage"=$lbbsErrorMessage}
      }
      :local lbbsAckJson [:serialize to=json options=json.no-string-conversion value=$lbbsAckPayload]
      :onerror ackError in={
        /tool fetch url=$ackUrl http-method=post http-header-field=$headers http-data=$lbbsAckJson check-certificate=yes output=none
      } do={
        :log warning ("LBBS: ACK pendiente: " . $ackError)
      }
    }
  } on-error={
    :log warning "LBBS: sincronizacion fallida"
  }
}
