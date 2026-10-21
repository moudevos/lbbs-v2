# LBBS50c - resume PARTIAL Staff pilot 50b at failed IPv6 rule 144.
# Does NOT repeat previously applied IPv4 rules, address-list or walled garden.
# RouterOS 7.23.8 hEX. No Clientes/NAT global/DHCP/bridge changes.
# IMPORTANT: upload current flash/lbbs-staff/login.html before importing.
:local staff [/ip hotspot find where name="lbbs-staff-hotspot"]
:local clients [/ip hotspot find where name="lbbs-hotspot"]
:local sync [/system script find where name="lbbs-staff-sync"]
:local syncScheduler [/system scheduler find where name="lbbs-staff-sync"]
:local hostScript [/system script find where name="lbbs-staff-hosts-v42"]
:local hostScheduler [/system scheduler find where name="lbbs-staff-hosts-v42"]
:local wide [/ip firewall filter find where comment="LBBS-GATE staff WAN OFF until captive proven"]

:if ([:len $staff] != 1 || [:len $clients] != 1 || [:len $wide] != 1) do={ :error "LBBS50c: HotSpot isolation missing" }
:if ([/ip hotspot get $staff disabled] = false || [/ip hotspot get $staff interface] != "bridge-staff") do={ :error "LBBS50c: Staff HotSpot must still be disabled" }
:if ([/ip hotspot get $clients disabled] = true || [/ip hotspot get $clients interface] != "bridge-hotspot") do={ :error "LBBS50c: Clientes not healthy" }
:if ([/ip firewall filter get $wide disabled] = false) do={ :error "LBBS50c: broad Staff WAN gate unsafe" }
:if ([:len $sync] != 1 || [:len $syncScheduler] != 1 || [:len $hostScript] != 1 || [:len $hostScheduler] != 1) do={ :error "LBBS50c: sync/host scripts missing" }
:if ([/system scheduler get $syncScheduler disabled] = false || [/system scheduler get $hostScheduler disabled] = false) do={ :error "LBBS50c: Staff schedulers must still be disabled" }
:if ([:len [/ip firewall filter find where comment="LBBS-STAFF-V50-FWD-JUMP" and action=jump and in-interface="bridge-staff"]] != 1) do={ :error "LBBS50c: existing IPv4 Staff jump missing" }
:if ([:len [/ip firewall filter find where comment="LBBS-STAFF-V50-DEFAULT-DROP"]] != 1) do={ :error "LBBS50c: Staff default DROP missing" }
:if ([:len [/ip firewall filter find where comment="LBBS-STAFF-V50-PREAUTH-API"]] != 1) do={ :error "LBBS50c: Staff API preauth missing" }
:if ([:len [/ip firewall filter find where comment="LBBS-STAFF-V50-AUTH-WAN"]] != 1) do={ :error "LBBS50c: Staff auth WAN missing" }
:if ([:len [/ip firewall filter find where comment="LBBS-STAFF-V50-INPUT-MGMT-DROP"]] != 1) do={ :error "LBBS50c: Staff input management DROP missing" }
:if ([:len [/ip firewall address-list find where list="lbbs-staff-v50-api"]] < 1) do={ :error "LBBS50c: Staff API DNS address-list missing" }
:if ([:len [/ip hotspot walled-garden ip find where comment="LBBS-STAFF-V50-WALLED-API" and server="lbbs-staff-hotspot"]] != 1) do={ :error "LBBS50c: Staff captive API walled garden missing" }
:if ([:len [/ip firewall nat find where comment="LBBS-STAFF-V50-NAT"]] != 0) do={ :error "LBBS50c: NAT already present; use audit/rollback" }
:if ([:len [/ipv6 firewall filter find where comment="LBBS-STAFF-V50-IPV6-FWD-DROP"]] != 0 || [:len [/ipv6 firewall filter find where comment="LBBS-STAFF-V50-IPV6-INPUT-DROP"]] != 0) do={ :error "LBBS50c: IPv6 rules already present; use audit/rollback" }

# Prevent IPv6 captive portal bypass. RouterOS indices '0' are ephemeral;
# place-before=0 fails with no existing rules. Insert before FIRST STATIC
# rule if present, otherwise append to an empty IPv6 filter table.
:local first6 [/ipv6 firewall filter find where dynamic=no]
:if ([:len $first6] = 0) do={
  /ipv6 firewall filter add chain=forward action=drop in-interface="bridge-staff" comment="LBBS-STAFF-V50-IPV6-FWD-DROP"
} else={
  /ipv6 firewall filter add chain=forward action=drop in-interface="bridge-staff" place-before=($first6->0) comment="LBBS-STAFF-V50-IPV6-FWD-DROP"
}
:local first6b [/ipv6 firewall filter find where dynamic=no]
:if ([:len $first6b] = 0) do={
  /ipv6 firewall filter add chain=input action=drop in-interface="bridge-staff" comment="LBBS-STAFF-V50-IPV6-INPUT-DROP"
} else={
  /ipv6 firewall filter add chain=input action=drop in-interface="bridge-staff" place-before=($first6b->0) comment="LBBS-STAFF-V50-IPV6-INPUT-DROP"
}
:if ([:len [/ipv6 firewall filter find where comment="LBBS-STAFF-V50-IPV6-FWD-DROP" and chain=forward and in-interface="bridge-staff" and action=drop]] != 1) do={ :error "LBBS50c: IPv6 forward isolation failed" }
:if ([:len [/ipv6 firewall filter find where comment="LBBS-STAFF-V50-IPV6-INPUT-DROP" and chain=input and in-interface="bridge-staff" and action=drop]] != 1) do={ :error "LBBS50c: IPv6 input isolation failed" }

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


# Only NOW enable the captive server and the two dedicated schedulers.
/system scheduler enable $syncScheduler
/system scheduler enable $hostScheduler
/ip hotspot enable $staff
:put "LBBS50c_PILOT=enabled"
:put ("LBBS50c_STAFF_DISABLED=" . [/ip hotspot get $staff disabled])
:put ("LBBS50c_CLIENTES_DISABLED=" . [/ip hotspot get $clients disabled])
:put ("LBBS50c_SYNC_DISABLED=" . [/system scheduler get $syncScheduler disabled])
:put ("LBBS50c_HOSTS_DISABLED=" . [/system scheduler get $hostScheduler disabled])
:put ("LBBS50c_IPV6_RULES=" . ([:len [/ipv6 firewall filter find where comment="LBBS-STAFF-V50-IPV6-FWD-DROP"]] + [:len [/ipv6 firewall filter find where comment="LBBS-STAFF-V50-IPV6-INPUT-DROP"]]))
:put "LBBS50c_ROLLBACK=flash/50c-lbbs-staff-pilot-rollback.rsc"
