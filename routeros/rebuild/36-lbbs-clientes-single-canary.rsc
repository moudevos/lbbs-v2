# LBBS36 — one-voucher canary expiry ONLY (RouterOS v7).
# Requires DB hotspot_reconcile_canary_v1 and canary API.
# No voucher is selected or armed by installing this script.
# Both this new scheduler and LBBS35's original observer can coexist.
# Starts DISABLED and self-disables when its one allowed command is queued.
# Do not install if old unsafe lbbs-reconcile scheduler is enabled.

:if ([:len [/ip hotspot find where name="lbbs-hotspot" and disabled=no]] != 1) do={ :error "LBBS36: Clientes HotSpot missing" }
:if ([:len [/system script find where name="lbbs-env"]] != 1) do={ :error "LBBS36: env missing" }
:if ([:len [/system script find where name="lbbs-presence-v2"]] != 1) do={ :error "LBBS36: observer missing" }
:if ([:len [/system scheduler find where name="lbbs-reconcile" and disabled=no]] > 0) do={ :error "LBBS36: unsafe old reconciler must remain disabled" }
:if ([:len [/system script find where name="lbbs-canary-v1"]] != 0) do={ :error "LBBS36: canary script exists" }
:if ([:len [/system scheduler find where name="lbbs-canary-v1"]] != 0) do={ :error "LBBS36: canary scheduler exists" }

/system script add name="lbbs-canary-v1" policy=ftp,read,write,policy,test,sensitive source={
  :global lbbsApiBaseUrl
  :global lbbsRouterToken
  :global lbbsCanaryLastOk
  :global lbbsCanaryLastResult
  :if ([:len $lbbsApiBaseUrl] = 0 || [:len $lbbsRouterToken] = 0) do={ :error "lbbs36_not_configured" }

  :local ids [:toarray ""]
  :foreach a in=[/ip hotspot active find where server="lbbs-hotspot"] do={
    :local username [/ip hotspot active get $a user]
    :local userId [/ip hotspot user find where name=$username and server="lbbs-hotspot"]
    :if ([:len $userId] != 1) do={ :error "LBBS36: incomplete active user identity" }
    :local tag [/ip hotspot user get $userId comment]
    :if ([:pick $tag 0 5] != "LBBS:" || [:len $tag] != 41) do={ :error "LBBS36: unrecognized active voucher" }
    :local voucherId [:pick $tag 5 41]
    :local exists false
    :foreach seenId in=$ids do={ :if ($seenId = $voucherId) do={ :set exists true } }
    :if ($exists = false) do={ :set ids ($ids, $voucherId) }
  }
  :if ([:len $ids] > 256) do={ :error "LBBS36: too many active IDs" }

  :local headers ("Content-Type: application/json,Authorization: Bearer " . $lbbsRouterToken)
  :local payload {"activeVoucherIds"=$ids;"enforce"=false;"canary"=true}
  :do {
    :local reply [/tool fetch url=($lbbsApiBaseUrl . "/api/wifi/router/reconcile/canary") http-method=post http-header-field=$headers http-data=[:serialize to=json options=json.no-string-conversion value=$payload] check-certificate=yes output=user as-value]
    :local body [:deserialize from=json options=json.no-string-conversion value=($reply->"data")]
    :if (($body->"ok") != true || [:tostr ($body->"version")] != "1" || ($body->"mode") != "canary") do={ :error "LBBS36: invalid canary API response" }
    :local count [:tonum ($body->"queued")]
    :if ($count < 0 || $count > 1) do={ :error "LBBS36: unsafe canary count" }
    :set lbbsCanaryLastOk ([:tostr [/system clock get date]] . " " . [:tostr [/system clock get time]])
    :set lbbsCanaryLastResult ("state=" . ($body->"state") . " queued=" . $count . " seen=" . ($body->"seen") . " missing=" . ($body->"missing"))
    :if ($count = 1) do={
      /system scheduler disable [find where name="lbbs-canary-v1"]
      :log info "LBBS36: one canary expiry queued; canary scheduler DISABLED"
    }
  } on-error={
    :log warning "LBBS36: canary call failed; inspect API/DB without printing secrets"
    :error "lbbs36_canary_failed"
  }
}

/system scheduler add name="lbbs-canary-v1" interval=30s on-event="/system script run lbbs-env; /system script run lbbs-canary-v1" policy=ftp,read,write,policy,test,sensitive disabled=yes comment="LBBS36 SINGLE CANARY ONLY - requires explicit database arming"
:log info "LBBS36: canary installed DISABLED; no voucher armed by installer"
