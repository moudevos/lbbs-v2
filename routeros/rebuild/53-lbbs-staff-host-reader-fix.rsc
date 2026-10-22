# LBBS53 Staff presence reporter hotfix, RouterOS 7.23.x.
# Replaces ONLY lbbs-staff-hosts-v42 source; no Clients/firewall/NAT changes.
# Corrects RouterOS-unsupported :toupper used when reading MAC of hotspot host.
# Builds JSON only from Staff HotSpot MAC/IP; never trusts browser MAC.
:local staff [/ip hotspot find where name="lbbs-staff-hotspot"]
:local clients [/ip hotspot find where name="lbbs-hotspot"]
:local script [/system script find where name="lbbs-staff-hosts-v42"]
:local scheduler [/system scheduler find where name="lbbs-staff-hosts-v42"]
:if ([:len $staff] != 1 || [/ip hotspot get $staff interface] != "bridge-staff") do={ :error "LBBS53: wrong Staff HotSpot" }
:if ([:len $clients] != 1 || [/ip hotspot get $clients disabled] = true) do={ :error "LBBS53: Clientes not active" }
:if ([:len $script] != 1 || [:len $scheduler] != 1) do={ :error "LBBS53: Staff presence reporter missing" }
:if ([/ip hotspot get $staff disabled] = true) do={ :error "LBBS53: Staff pilot HotSpot disabled; no host report" }
:if ([/ip hotspot get $staff interface] != "bridge-staff") do={ :error "LBBS53: invalid Staff interface" }
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
      :local mac [:tostr ($row->"mac-address")]
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
    :log warning ("LBBS53 Staff hosts failure at " . $stage)
  }
}

# Verify the replacement once immediately; no need for a second diagnostics RSC.
/system script run lbbs-env
/system script run lbbs-staff-hosts-v42
:global lbbsStaffHostsResult
:put ("LBBS53_HOSTS=" . $lbbsStaffHostsResult)

:if ([:pick $lbbsStaffHostsResult 0 8] = "ok seen=") do={
  /system scheduler enable $scheduler
  :put "LBBS53_HOSTS_SCHEDULER=enabled"
} else={
  :put "LBBS53_HOSTS_SCHEDULER=disabled"
}

:put ("LBBS53_STAFF_HOTSPOT_DISABLED=" . [/ip hotspot get $staff disabled])
:put ("LBBS53_CLIENTES_DISABLED=" . [/ip hotspot get $clients disabled])
:put ("LBBS53_HOST_ENTRIES=" . [:len [/ip hotspot host find where server="lbbs-staff-hotspot"]])
