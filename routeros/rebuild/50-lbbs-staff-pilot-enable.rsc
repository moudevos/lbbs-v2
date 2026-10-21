# LBBS50 Safe Staff portal pilot for MikroTik hEX 7.23.x.
# Requires latest portal files from routeros/hotspot/portal/lbbs-cautive-staff
# on flash/lbbs-staff. Clients untouched. All rules scoped to bridge-staff.
# Use WinBox over Ethernet admin. Rollback: 50-lbbs-staff-pilot-rollback.rsc.

:local staff [/ip hotspot find where name="lbbs-staff-hotspot"]
:local clients [/ip hotspot find where name="lbbs-hotspot"]
:local sync [/system script find where name="lbbs-staff-sync"]
:local syncScheduler [/system scheduler find where name="lbbs-staff-sync"]
:local wide [/ip firewall filter find where comment="LBBS-GATE staff WAN OFF until captive proven"]
:local lastDrop [/ip firewall filter find where comment="LBBS-BOOT-Forward-Drop"]

:if ([:len $staff] != 1 || [:len $clients] != 1) do={ :error "LBBS50: HotSpot server missing" }
:if ([/ip hotspot get $staff disabled] = false || [/ip hotspot get $staff interface] != "bridge-staff") do={ :error "LBBS50: Staff must be disabled on bridge-staff" }
:if ([/ip hotspot get $clients disabled] = true || [/ip hotspot get $clients interface] != "bridge-hotspot") do={ :error "LBBS50: Clientes not operational" }
:if ([:len $sync] != 1 || [:len $syncScheduler] != 1) do={ :error "LBBS50: v49 staff sync missing" }
:if ([/system scheduler get $syncScheduler disabled] = false) do={ :error "LBBS50: Staff sync scheduler must be disabled" }
:if ([:len $wide] != 1 || [/ip firewall filter get $wide disabled] = false) do={ :error "LBBS50: broad Staff WAN rule must stay disabled" }
:if ([:len $lastDrop] != 1 || [/ip firewall filter get $lastDrop disabled] = true || [/ip firewall filter get $lastDrop action] != "drop") do={ :error "LBBS50: forward default deny missing" }
:if ([:len [/ip address find where interface="bridge-staff" and address="10.10.20.1/24"]] != 1) do={ :error "LBBS50: unexpected Staff gateway" }
:if ([:len [/interface bridge port find where bridge="bridge-staff" and interface="ether4"]] != 1) do={ :error "LBBS50: Staff AP not on ether4" }
:if ([:len [/ip dhcp-server find where name="dhcp-staff" and disabled=no]] != 1) do={ :error "LBBS50: Staff DHCP not running" }
:if ([:len [/ip hotspot user profile find where name="lbbs-staff-user-profile"]] != 1) do={ :error "LBBS50: Staff user profile missing" }
:if ([:len [/ip hotspot profile find where name="lbbs-staff-hotspot-profile"]] != 1) do={ :error "LBBS50: Staff portal profile missing" }

# Verify complete Staff portal bundle before any activation.
:foreach fname in={"login.html";"alogin.html";"status.html";"logout.html";"error.html";"styles.css";"staff.css";"md5.js";"api.json";"assets/lbbs-logo.svg"} do={
  :if ([:len [/file find where name=("flash/lbbs-staff/" . $fname)]] != 1) do={ :error ("LBBS50: missing portal file " . $fname) }
}
:if ([/ip hotspot profile get [find where name="lbbs-staff-hotspot-profile"] html-directory] != "flash/lbbs-staff") do={ :error "LBBS50: Staff portal directory mismatch" }
:local loginSource [/file get [/file find where name="flash/lbbs-staff/login.html"] contents]
:if ([:typeof [:find $loginSource "LBBS-STAFF-PILOT-V50"]] = "nil") do={ :error "LBBS50: upload the new fixed Staff login.html before enabling" }

# Refuse a partial/double import; operator can run the Staff-only rollback.
:if ([:len [/ip firewall filter find where comment="LBBS-STAFF-V50-FWD-JUMP"]] > 0) do={ :error "LBBS50: pilot already present; use rollback to reinstall" }
:if ([:len [/ip firewall address-list find where list="lbbs-staff-v50-api"]] > 0) do={ :error "LBBS50: Staff API address-list already present" }
:if ([:len [/ip hotspot walled-garden ip find where comment="LBBS-STAFF-V50-WALLED-API"]] > 0) do={ :error "LBBS50: Staff walled garden already present" }

# Keep v49 roster consistent before opening Staff. No tokens printed.
/system script run lbbs-env
:global lbbsStaffLastSync
/system script run lbbs-staff-sync
:if ([:pick $lbbsStaffLastSync 0 11] != "ok devices=") do={ :error "LBBS50: Staff roster sync not healthy" }

# Install dedicated Staff-only host reporter, if absent.
:if ([:len [/system script find where name="lbbs-staff-hosts-v42"]] = 0) do={
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
}
:local hostScript [/system script find where name="lbbs-staff-hosts-v42"]
:if ([:len $hostScript] != 1) do={ :error "LBBS50: host reporter missing" }
:if ([:len [/system scheduler find where name="lbbs-staff-hosts-v42"]] = 0) do={
  /system scheduler add name="lbbs-staff-hosts-v42" disabled=yes interval=10s policy=ftp,read,write,policy,test,sensitive on-event="/system script run lbbs-env; /system script run lbbs-staff-hosts-v42" comment="LBBS50 Staff physical host polling"
}
:local hostsScheduler [/system scheduler find where name="lbbs-staff-hosts-v42"]
:if ([:len $hostsScheduler] != 1 || [/system scheduler get $hostsScheduler disabled] = false) do={ :error "LBBS50: host reporter must be staged disabled" }

# End-to-end backend attestation request with ZERO hosts, before opening WAN.
:global lbbsStaffHostsResult
:set lbbsStaffHostsResult "not_started"
/system script run lbbs-staff-hosts-v42
:if ([:pick $lbbsStaffHostsResult 0 8] != "ok seen=") do={ :error "LBBS50: host reporter backend check failed" }

# Create hostname-scoped HTTPS preauth. DNS FQDN tracks Vercel IP changes.
/ip firewall address-list add list="lbbs-staff-v50-api" address="app.labajaditabarberstudio.com" comment="LBBS-STAFF-V50-API-DNS"
/ip hotspot walled-garden ip add server="lbbs-staff-hotspot" dst-host="app.labajaditabarberstudio.com" protocol=tcp dst-port=443 action=accept comment="LBBS-STAFF-V50-WALLED-API"

# Strict Staff-only forward policy. PRIVATE networks are never reachable.
# A single jump at top prevents generic RouterOS forward allows bypassing us.
/ip firewall filter add chain="lbbs-staff-v50" action=drop dst-address=10.0.0.0/8 comment="LBBS-STAFF-V50-PRIVATE-10"
/ip firewall filter add chain="lbbs-staff-v50" action=drop dst-address=172.16.0.0/12 comment="LBBS-STAFF-V50-PRIVATE-172"
/ip firewall filter add chain="lbbs-staff-v50" action=drop dst-address=192.168.0.0/16 comment="LBBS-STAFF-V50-PRIVATE-192"
/ip firewall filter add chain="lbbs-staff-v50" action=accept hotspot=!auth protocol=tcp dst-port=443 dst-address-list="lbbs-staff-v50-api" out-interface=ether1 comment="LBBS-STAFF-V50-PREAUTH-API"
/ip firewall filter add chain="lbbs-staff-v50" action=accept hotspot=auth out-interface=ether1 comment="LBBS-STAFF-V50-AUTH-WAN"
/ip firewall filter add chain="lbbs-staff-v50" action=drop comment="LBBS-STAFF-V50-DEFAULT-DROP"
/ip firewall filter add chain=forward action=jump in-interface="bridge-staff" jump-target="lbbs-staff-v50" place-before=0 comment="LBBS-STAFF-V50-FWD-JUMP"

# Restrict Staff devices from administrative router services (HotSpot HTTP/DNS untouched).
/ip firewall filter add chain=input action=drop in-interface="bridge-staff" protocol=tcp dst-port=21,22,23,8291,8728,8729 place-before=0 comment="LBBS-STAFF-V50-INPUT-MGMT-DROP"

# HotSpot is IPv4-only: block IPv6 Staff traffic to prevent captive-portal bypass.
/ipv6 firewall filter add chain=forward action=drop in-interface="bridge-staff" place-before=0 comment="LBBS-STAFF-V50-IPV6-FWD-DROP"
/ipv6 firewall filter add chain=input action=drop in-interface="bridge-staff" place-before=0 comment="LBBS-STAFF-V50-IPV6-INPUT-DROP"

# Staff-specific NAT; no changes to Clientes NAT rules.
/ip firewall nat add chain=srcnat action=masquerade src-address=10.10.20.0/24 out-interface=ether1 comment="LBBS-STAFF-V50-NAT"

# Session telemetry hooks use 96-char per-device versioned LBBSSTAFF tag.
# A login/logout is still valid even if telemetry is temporarily unavailable.
:local profile [/ip hotspot user profile find where name="lbbs-staff-user-profile"]
/ip hotspot user profile set $profile on-login={
  :global lbbsApiBaseUrl
  :global lbbsRouterToken
  :local username $user
  :local currentMac [:toupper $"mac-address"]
  :local ids [/ip hotspot user find where name=$username and server="lbbs-staff-hotspot" and comment~"^LBBSSTAFF:"]
  :if ([:len $ids] = 1 && [:len $lbbsRouterToken] > 0 && [:len $lbbsApiBaseUrl] > 0) do={
    :local tag [/ip hotspot user get $ids comment]
    :if ([:len $tag] = 96) do={
      :local cid [:pick $tag 10 46]
      :local did [:pick $tag 47 83]
      :local k ($username . ":" . $currentMac . ":" . [/system clock get date] . ":" . [/system clock get time])
      :local data [:serialize to=json options=json.no-string-conversion value={"event"="LOGIN";"credentialId"=$cid;"deviceId"=$did;"mac"=$currentMac;"sessionKey"=$k}]
      :do {
        /tool fetch url=($lbbsApiBaseUrl . "/api/wifi/router/staff/session") http-method=post http-header-field=("Content-Type: application/json,Authorization: Bearer " . $lbbsRouterToken) http-data=$data check-certificate=yes output=none
      } on-error={ :log warning "LBBS50: Staff login telemetry unavailable" }
    }
  }
}
/ip hotspot user profile set $profile on-logout={
  :global lbbsApiBaseUrl
  :global lbbsRouterToken
  :local username $user
  :local currentMac [:toupper $"mac-address"]
  :local ids [/ip hotspot user find where name=$username and server="lbbs-staff-hotspot" and comment~"^LBBSSTAFF:"]
  :if ([:len $ids] = 1 && [:len $lbbsRouterToken] > 0 && [:len $lbbsApiBaseUrl] > 0) do={
    :local tag [/ip hotspot user get $ids comment]
    :if ([:len $tag] = 96) do={
      :local cid [:pick $tag 10 46]
      :local did [:pick $tag 47 83]
      :local data [:serialize to=json options=json.no-string-conversion value={"event"="LOGOUT";"credentialId"=$cid;"deviceId"=$did;"mac"=$currentMac}]
      :do {
        /tool fetch url=($lbbsApiBaseUrl . "/api/wifi/router/staff/session") http-method=post http-header-field=("Content-Type: application/json,Authorization: Bearer " . $lbbsRouterToken) http-data=$data check-certificate=yes output=none
      } on-error={ :log warning "LBBS50: Staff logout telemetry unavailable" }
    }
  }
}

# Last step: enable ONLY the dedicated Staff schedulers and HotSpot.
/system scheduler enable $syncScheduler
/system scheduler enable $hostsScheduler
/ip hotspot enable $staff

:put "LBBS50_PILOT=enabled"
:put ("LBBS50_STAFF_HOTSPOT_DISABLED=" . [/ip hotspot get $staff disabled])
:put ("LBBS50_CLIENTES_DISABLED=" . [/ip hotspot get $clients disabled])
:put ("LBBS50_SYNC_SCHEDULER_DISABLED=" . [/system scheduler get $syncScheduler disabled])
:put ("LBBS50_HOST_SCHEDULER_DISABLED=" . [/system scheduler get $hostsScheduler disabled])
:put ("LBBS50_FORWARD_JUMP=" . [:len [/ip firewall filter find where comment="LBBS-STAFF-V50-FWD-JUMP"]])
:put ("LBBS50_WALLED_GARDEN=" . [:len [/ip hotspot walled-garden ip find where comment="LBBS-STAFF-V50-WALLED-API"]])
:put "LBBS50_ROLLBACK=flash/50-lbbs-staff-pilot-rollback.rsc"
