# LBBS WiFi Clientes / session-presence V2 (SHADOW / OBSERVE ONLY).
# Prerequisites: Supabase reconcile_hotspot_client_sessions_v2 migration,
# production API /api/wifi/router/reconcile v2, lbbs-env, lbbs-sync.
# Installer is one-time, disabled by default; no WAN/Staff/DHCP/HotSpot edits.
# Old lbbs-reconcile scheduler MUST remain disabled.

:if ([:len [/ip hotspot find where name="lbbs-hotspot" and disabled=no]] != 1) do={ :error "LBBS35: Clientes HotSpot missing" }
:if ([:len [/system script find where name="lbbs-env"]] != 1) do={ :error "LBBS35: env missing" }
:if ([:len [/system script find where name="lbbs-sync"]] != 1) do={ :error "LBBS35: sync missing" }
:if ([:len [/system scheduler find where name="lbbs-reconcile" and disabled=no]] > 0) do={ :error "LBBS35: disable unsafe previous scheduler first" }
:if ([:len [/system script find where name="lbbs-presence-v2"]] != 0) do={ :error "LBBS35: script already installed" }
:if ([:len [/system scheduler find where name="lbbs-presence-v2"]] != 0) do={ :error "LBBS35: scheduler already installed" }

/system script add name="lbbs-presence-v2" policy=ftp,read,write,policy,test,sensitive source={
  :global lbbsApiBaseUrl
  :global lbbsRouterToken
  :global lbbsPresenceV2LastOk
  :global lbbsPresenceV2LastResult
  :if ([:len $lbbsApiBaseUrl] = 0 || [:len $lbbsRouterToken] = 0) do={ :error "lbbs35_not_configured" }

  :local ids [:toarray ""]
  :foreach a in=[/ip hotspot active find where server="lbbs-hotspot"] do={
    :local username [/ip hotspot active get $a user]
    :local userId [/ip hotspot user find where name=$username and server="lbbs-hotspot"]
    :if ([:len $userId] != 1) do={ :error "LBBS35: ambiguous authenticated user; snapshot not submitted" }
    :local tag [/ip hotspot user get $userId comment]
    :if ([:pick $tag 0 5] != "LBBS:" || [:len $tag] != 41) do={ :error "LBBS35: unmanaged active session; snapshot not submitted" }
    :local voucherId [:pick $tag 5 41]

    # A MAC may temporarily have two IP hosts. Report each voucher exactly ONCE.
    :local existing false
    :foreach seenId in=$ids do={
      :if ($seenId = $voucherId) do={ :set existing true }
    }
    :if (!$existing) do={ :set ids ($ids, $voucherId) }
  }
  :if ([:len $ids] > 256) do={ :error "LBBS35: too many client voucher IDs; snapshot not submitted" }

  :local headers ("Content-Type: application/json,Authorization: Bearer " . $lbbsRouterToken)
  :local payload {"activeVoucherIds"=$ids;"enforce"=false}
  :do {
    :local reply [/tool fetch url=($lbbsApiBaseUrl . "/api/wifi/router/reconcile") http-method=post http-header-field=$headers http-data=[:serialize to=json options=json.no-string-conversion value=$payload] check-certificate=yes output=user as-value]
    :local body [:deserialize from=json options=json.no-string-conversion value=($reply->"data")]
    :if (($body->"ok") != true || [:tostr ($body->"version")] != "2" || ($body->"mode") != "observe" || ($body->"queued") != 0) do={ :error "LBBS35: unsafe API version/mode or queued count" }
    :set lbbsPresenceV2LastOk ([:tostr [/system clock get date]] . " " . [:tostr [/system clock get time]])
    :set lbbsPresenceV2LastResult ("seen=" . ($body->"seen") . " missing=" . ($body->"missing") . " grace=" . ($body->"gracePending") . " wouldExpire=" . ($body->"wouldExpire") . " queued=" . ($body->"queued"))
  } on-error={
    :log warning "LBBS35: snapshot failed; no automatic disconnect attempted"
    :error "lbbs35_reconcile_failed"
  }
}

/system scheduler add name="lbbs-presence-v2" interval=30s on-event="/system script run lbbs-env; /system script run lbbs-presence-v2" policy=ftp,read,write,policy,test,sensitive disabled=yes comment="LBBS35 Clientes session presence V2 - observe only"
:log info "LBBS35: observation-only session tracker installed with scheduler disabled"
