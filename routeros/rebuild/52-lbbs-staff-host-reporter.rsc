# LBBS52 Staff presence reporter hotfix, RouterOS 7.23.x.
# Replaces ONLY lbbs-staff-hosts-v42 source; no Clients/firewall/NAT changes.
# Fixes dynamic assignment into an empty RouterOS array at host_read.
# Builds strict JSON from router-observed MAC and IPv4; never trusts browser MAC.
:local staff [/ip hotspot find where name="lbbs-staff-hotspot"]
:local clients [/ip hotspot find where name="lbbs-hotspot"]
:local script [/system script find where name="lbbs-staff-hosts-v42"]
:local scheduler [/system scheduler find where name="lbbs-staff-hosts-v42"]
:if ([:len $staff] != 1 || [/ip hotspot get $staff interface] != "bridge-staff") do={ :error "LBBS52: wrong Staff HotSpot" }
:if ([:len $clients] != 1 || [/ip hotspot get $clients disabled] = true) do={ :error "LBBS52: Clientes not active" }
:if ([:len $script] != 1 || [:len $scheduler] != 1) do={ :error "LBBS52: Staff presence reporter missing" }
:local wasEnabled false
:if ([/system scheduler get $scheduler disabled] = false) do={ :set wasEnabled true }
/system scheduler disable $scheduler

/system script set $script policy=ftp,read,write,policy,test,sensitive source={
  :global lbbsApiBaseUrl
  :global lbbsRouterToken
  :global lbbsStaffHostsResult
  :local stage "start"
  :set lbbsStaffHostsResult "starting"
  :onerror fault in={
    :set stage "env"
    :if ([:len $lbbsApiBaseUrl] = 0 || [:len $lbbsRouterToken] = 0) do={ :error "staff_env_missing" }

    :set stage "enumerate_hosts"
    :local found [/ip hotspot host print as-value where server="lbbs-staff-hotspot"]
    :local countHosts 0
    :local json "{\"hosts\":{"
    :foreach row in=$found do={
      :set stage "read_mac"
      :local mac [:toupper [:tostr ($row->"mac-address")]]
      :set stage "read_ip"
      :local ip [:tostr ($row->"address")]
      :set stage "validate_host"
      :if ([:len $mac] = 17 && [:pick $ip 0 9] = "10.10.20.") do={
        :if ($countHosts >= 96) do={ :error "too_many_hosts" }
        :set stage "append_host"
        :if ($countHosts > 0) do={ :set json ($json . ",") }
        :set json ($json . "\"" . $mac . "\":\"" . $ip . "\"")
        :set countHosts ($countHosts + 1)
      }
    }
    :set stage "finish_json"
    :set json ($json . "}}")

    :set stage "fetch"
    :local h ("Content-Type: application/json,Authorization: Bearer " . $lbbsRouterToken)
    :local response [/tool fetch url=($lbbsApiBaseUrl . "/api/wifi/router/staff/hosts") http-method=post http-header-field=$h http-data=$json check-certificate=yes output=user as-value]

    :set stage "parse"
    :local decoded [:deserialize from=json options=json.no-string-conversion value=($response->"data")]
    :if (($decoded->"ok") != true) do={ :error "staff_host_ack_invalid" }
    :local reported ($decoded->"seen")
    :set lbbsStaffHostsResult ("ok seen=" . $reported)
  } do={
    :set lbbsStaffHostsResult ("failed stage=" . $stage)
    :log warning ("LBBS52 Staff hosts failure at " . $stage)
  }
}

# Verify the replacement once immediately; no need for a second diagnostics RSC.
/system script run lbbs-env
/system script run lbbs-staff-hosts-v42
:global lbbsStaffHostsResult
:put ("LBBS52_HOSTS=" . $lbbsStaffHostsResult)

:if ([:pick $lbbsStaffHostsResult 0 8] = "ok seen=" && $wasEnabled) do={
  /system scheduler enable $scheduler
  :put "LBBS52_HOSTS_SCHEDULER=enabled"
} else={
  :put "LBBS52_HOSTS_SCHEDULER=disabled"
}

:put ("LBBS52_STAFF_HOTSPOT_DISABLED=" . [/ip hotspot get $staff disabled])
:put ("LBBS52_CLIENTES_DISABLED=" . [/ip hotspot get $clients disabled])
:put ("LBBS52_HOST_ENTRIES=" . [:len [/ip hotspot host find where server="lbbs-staff-hotspot"]])
