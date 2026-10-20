# LBBS Clients policy reconciliation (RouterOS 7.23.8).
# Staged installer; deploy API /api/wifi/router/reconcile before import.
# RouterOS keepalive-timeout=3m grants the experimentally verified grace:
# client reconnects while still in /ip hotspot active -> continues session;
# after timeout the client is absent -> reconciler schedules EXPIRE_VOUCHER.
# Server session_expires_at from first LOGIN caps lifetime across reconnects.
# It does not modify WAN, HotSpot login, cookies, admin or Staff.
# Run ONCE; this is NOT an idempotent reinstall script.

:if ([:len [/ip hotspot find where name="lbbs-hotspot" and disabled=no]] != 1) do={ :error "LBBS33: customer hotspot not active" }
:if ([:len [/system script find where name="lbbs-env"]] != 1) do={ :error "LBBS33: env missing" }
:if ([:len [/system script find where name="lbbs-sync"]] != 1) do={ :error "LBBS33: command sync missing" }
:if ([:len [/system script find where name="lbbs-reconcile"]] != 0) do={ :error "LBBS33: reconcile already present" }
:if ([:len [/system scheduler find where name="lbbs-reconcile"]] != 0) do={ :error "LBBS33: scheduler already present" }
:local clientProfile [/ip hotspot user profile find where name="lbbs-client-profile"]
:if ([:len $clientProfile] != 1) do={ :error "LBBS33: client profile missing" }
:if ([:tostr [/ip hotspot user profile get $clientProfile keepalive-timeout]] != "3m") do={ :error "LBBS33: keepalive-timeout must be 3m" }

# Authenticated snapshot. No clients are modified by this script. It POSTs
# only UUID voucher IDs (never usernames/passwords, never MAC or router token
# in log output). Server decides which vouchers to expire and queues RouterOS
# EXPIRE_VOUCHER through the already running lbbs-sync/ACK mechanism.
/system script add name="lbbs-reconcile" policy=ftp,read,write,policy,test,sensitive source={
  :global lbbsApiBaseUrl
  :global lbbsRouterToken
  :if ([:len $lbbsApiBaseUrl] = 0 || [:len $lbbsRouterToken] = 0) do={ :log warning "LBBS33: runtime not configured"; :error "lbbs_not_configured" }
  :local ids [:toarray ""]
  :local countActive 0
  :foreach a in=[/ip hotspot active find where server="lbbs-hotspot"] do={
    :set countActive ($countActive + 1)
    :local username [/ip hotspot active get $a user]
    :local localUser [/ip hotspot user find where name=$username and server="lbbs-hotspot"]
    :if ([:len $localUser] != 1) do={ :error "LBBS33: active user not uniquely identified" }
    :local tag [/ip hotspot user get $localUser comment]
    :if ([:pick $tag 0 5] != "LBBS:" || [:len $tag] != 41) do={ :error "LBBS33: unmanaged active session" }
    :local voucherId [:pick $tag 5 41]
    :set ids ($ids, $voucherId)
  }
  :if ([:len $ids] != $countActive) do={ :error "LBBS33: incomplete snapshot" }
  :local headers ("Content-Type: application/json,Authorization: Bearer " . $lbbsRouterToken)
  :local payload {"activeVoucherIds"=$ids}
  :do {
    :local reply [/tool fetch url=($lbbsApiBaseUrl . "/api/wifi/router/reconcile") http-method=post http-header-field=$headers http-data=[:serialize to=json options=json.no-string-conversion value=$payload] check-certificate=yes output=user as-value]
    :local body [:deserialize from=json options=json.no-string-conversion value=($reply->"data")]
    :if (($body->"ok") != true) do={ :error "LBBS33: server response invalid" }
  } on-error={
    :log warning "LBBS33: reconcile failed (check deployed API, auth, firewall and Vercel logs)"
  }
}

/system scheduler add name="lbbs-reconcile" interval=30s on-event="/system script run lbbs-env; /system script run lbbs-reconcile" policy=ftp,read,write,policy,test,sensitive disabled=no comment="LBBS33 Customers online snapshot"
:log info "LBBS33: client reconciler installed; never import legacy logout hooks"
