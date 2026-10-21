# LBBS 42 - Staff host attestation only. RouterOS hEX 7.23.8.
# ONLY observes /ip hotspot host of lbbs-staff-hotspot.
# NO firewall, NAT, WAN, Clientes, user, cookies or HotSpot changes.
# Adds a DISABLED 10s scheduler; never implicitly enables Staff Internet.
:local srv [/ip hotspot find where name="lbbs-staff-hotspot"]
:if ([:len $srv] != 1) do={ :error "LBBS42: dedicated Staff HotSpot missing" }
:if ([/ip hotspot get $srv interface] != "bridge-staff") do={ :error "LBBS42: Staff HotSpot on wrong bridge" }
:if ([:len [/system script find where name="lbbs-env"]] != 1) do={ :error "LBBS42: router env unavailable" }
:if ([:len [/system script find where name="lbbs-staff-hosts-v42"]] != 0) do={ :error "LBBS42: host reporter already installed" }
:if ([:len [/system scheduler find where name="lbbs-staff-hosts-v42"]] != 0) do={ :error "LBBS42: host scheduler already installed" }

/system script add name="lbbs-staff-hosts-v42" policy=ftp,read,write,policy,test,sensitive source={
  :global lbbsApiBaseUrl
  :global lbbsRouterToken
  :global lbbsStaffHostsResult

  :local stage "env"
  :onerror fault in={
    :if ([:len $lbbsApiBaseUrl] = 0 || [:len $lbbsRouterToken] = 0) do={ :error "missing_env" }
    :local observed [:toarray ""]
    :set stage "host_read"
    :foreach host in=[/ip hotspot host find where server="lbbs-staff-hotspot"] do={
      :local mac [:toupper [:tostr [/ip hotspot host get $host mac-address]]]
      :local ip [:tostr [/ip hotspot host get $host address]]
      :if ([:len $mac] = 17 && [:pick $ip 0 9] = "10.10.20.") do={
        :set ($observed->$mac) $ip
      }
    }
    :set stage "fetch"
    :local payload [:serialize to=json options=json.no-string-conversion value={"hosts"=$observed}]
    :local response [/tool fetch url=($lbbsApiBaseUrl . "/api/wifi/router/staff/hosts") http-method=post http-header-field=("Content-Type: application/json,Authorization: Bearer " . $lbbsRouterToken) http-data=$payload check-certificate=yes output=user as-value]
    :set stage "parse"
    :local decoded [:deserialize from=json options=json.no-string-conversion value=($response->"data")]
    :if (($decoded->"ok") != true) do={ :error "not_acknowledged" }
    :set lbbsStaffHostsResult ("ok seen=" . ($decoded->"seen"))
  } do={
    :set lbbsStaffHostsResult ("failed stage=" . $stage)
    :log warning ("LBBS42: Staff host attestation failed at " . $stage)
  }
}

/system scheduler add name="lbbs-staff-hosts-v42" interval=10s disabled=yes policy=ftp,read,write,policy,test,sensitive on-event="/system script run lbbs-env; /system script run lbbs-staff-hosts-v42" comment="LBBS42 Staff-only host attestation; STAGED DISABLED"

:log info "LBBS42 STAGED: Staff host attestation installed DISABLED, no WAN changes"
