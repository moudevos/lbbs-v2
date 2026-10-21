# LBBS40 v3 - Staff HotSpot staged installer / RouterOS 7.23.8 hEX RB750Gr3
# RECOVERS interrupted run after profile creation. Safe to re-import if STAGED.
# NO reset, no updates to Clientes, bridges, WAN, NAT, DHCP, firewall or sync.
# Uses the ORIGINAL Staff portal, not the static dashboard demonstration.
# Deliberately NO Staff users, IP bindings, secrets or pre-auth WAN exception.
# Staff WAN remains BLOCKED and Staff HotSpot remains DISABLED after success.
# DNS: wifi-staff.lbbs.test | gateway: 10.10.20.1 | bridge: bridge-staff.

# 1. Full PRECHECK: do not change anything until all invariants pass.
:if ([:len [/interface bridge find where name="bridge-staff"]] != 1) do={ :error "LBBS40: bridge-staff missing" }
:if ([:len [/interface bridge port find where bridge="bridge-staff" and interface="ether4"]] != 1) do={ :error "LBBS40: ether4 not attached to Staff bridge" }
:if ([:len [/interface bridge port find where bridge="bridge-staff"]] != 1) do={ :error "LBBS40: Staff bridge has unexpected ports" }
:if ([:len [/ip address find where interface="bridge-staff" and address="10.10.20.1/24"]] != 1) do={ :error "LBBS40: Staff gateway mismatch" }
:local staffDhcp [/ip dhcp-server find where name="dhcp-staff"]
:if ([:len $staffDhcp] != 1) do={ :error "LBBS40: Staff DHCP missing" }
:if (([/ip dhcp-server get $staffDhcp interface] != "bridge-staff") || ([/ip dhcp-server get $staffDhcp disabled] = true)) do={ :error "LBBS40: Staff DHCP not ready" }

:local clientsServer [/ip hotspot find where name="lbbs-hotspot"]
:if ([:len $clientsServer] != 1) do={ :error "LBBS40: Clients HotSpot missing" }
:if (([/ip hotspot get $clientsServer interface] != "bridge-hotspot") || ([/ip hotspot get $clientsServer disabled] = true)) do={ :error "LBBS40: Clients HotSpot unhealthy" }

:local staffWanGate [/ip firewall filter find where comment="LBBS-GATE staff WAN OFF until captive proven"]
:if ([:len $staffWanGate] != 1) do={ :error "LBBS40: Staff WAN gate missing" }
:if (([/ip firewall filter get $staffWanGate disabled] = false) || ([/ip firewall filter get $staffWanGate chain] != "forward")) do={ :error "LBBS40: unsafe Staff WAN gate" }
:local forwardDrop [/ip firewall filter find where comment="LBBS-BOOT-Forward-Drop"]
:if ([:len $forwardDrop] != 1) do={ :error "LBBS40: final forward DROP missing" }
:if (([/ip firewall filter get $forwardDrop chain] != "forward") || ([/ip firewall filter get $forwardDrop action] != "drop") || ([/ip firewall filter get $forwardDrop disabled] = true)) do={ :error "LBBS40: final forward DROP invalid" }

# The ORIGINAL portal is a complete local HTML/CSS/CHAP bundle.
:foreach resource in={"login.html";"alogin.html";"status.html";"logout.html";"error.html";"styles.css";"staff.css";"md5.js";"api.json";"assets/lbbs-logo.svg"} do={
  :local filepath ("flash/lbbs-staff/" . $resource)
  :if ([:len [/file find where name=$filepath]] != 1) do={ :error ("LBBS40: portal file missing: " . $resource) }
}

# Do not take ownership of foreign entries or enable anything.
:local staffProfiles [/ip hotspot profile find where name="lbbs-staff-hotspot-profile"]
:local staffUserProfiles [/ip hotspot user profile find where name="lbbs-staff-user-profile"]
:local staffServers [/ip hotspot find where interface="bridge-staff"]
:local staffNamed [/ip hotspot find where name="lbbs-staff-hotspot"]

:if ([:len $staffProfiles] > 1) do={ :error "LBBS40: duplicate Staff HotSpot profiles" }
:if ([:len $staffUserProfiles] > 1) do={ :error "LBBS40: duplicate Staff user profiles" }
:if ([:len $staffServers] > 1 || [:len $staffNamed] > 1) do={ :error "LBBS40: duplicate Staff servers" }
:if (([:len $staffServers] = 1 && [:len $staffNamed] = 0) || ([:len $staffServers] = 0 && [:len $staffNamed] = 1)) do={ :error "LBBS40: conflicting existing HotSpot" }

# An interrupted v1 run created these two profiles; validate before reuse.
:if ([:len $staffProfiles] = 1) do={
  :if (([/ip hotspot profile get $staffProfiles hotspot-address] != "10.10.20.1") || ([/ip hotspot profile get $staffProfiles dns-name] != "wifi-staff.lbbs.test") || ([/ip hotspot profile get $staffProfiles html-directory] != "flash/lbbs-staff") || ([/ip hotspot profile get $staffProfiles login-by] != "http-chap")) do={ :error "LBBS40: existing Staff HotSpot profile differs" }
}
:if ([:len $staffUserProfiles] = 1) do={
  :local shared [/ip hotspot user profile get $staffUserProfiles shared-users]
  :if (($shared != 1) && ($shared != 2)) do={ :error "LBBS40: existing Staff session limit unexpected" }
  :if ([/ip hotspot user profile get $staffUserProfiles add-mac-cookie] = true) do={ :error "LBBS40: unexpected Staff MAC cookies enabled" }
}
:if ([:len $staffNamed] = 1) do={
  :if (([/ip hotspot get $staffNamed interface] != "bridge-staff") || ([/ip hotspot get $staffNamed profile] != "lbbs-staff-hotspot-profile") || ([/ip hotspot get $staffNamed disabled] = false)) do={ :error "LBBS40: existing Staff server differs or is enabled" }
  :if ([:len [/ip hotspot user find where server="lbbs-staff-hotspot"]] > 0) do={ :error "LBBS40: existing Staff users found; manual audit required" }
}

# 2. Controlled create/resume. Never modify the Clientes server/profile.
:if ([:len $staffProfiles] = 0) do={
  /ip hotspot profile add name="lbbs-staff-hotspot-profile" hotspot-address=10.10.20.1 dns-name="wifi-staff.lbbs.test" login-by=http-chap html-directory="flash/lbbs-staff" use-radius=no
  :log info "LBBS40: Staff HotSpot profile created"
} else={
  :log info "LBBS40: existing Staff HotSpot profile reused"
}

:if ([:len $staffUserProfiles] = 0) do={
  /ip hotspot user profile add name="lbbs-staff-user-profile" shared-users=2 idle-timeout=none keepalive-timeout=3m add-mac-cookie=no
  :log info "LBBS40: Staff user profile created (two parallel sessions)"
} else={
  # The first failed importer used shared-users=1. This profile belongs to
  # Staff only; changing it does not affect lbbs-client-profile.
  /ip hotspot user profile set $staffUserProfiles shared-users=2
  :log info "LBBS40: existing Staff profile set to 2 sessions"
}

:if ([:len $staffNamed] = 0) do={
  # RouterOS '/ip hotspot add' DOES NOT accept 'comment'. No comment here!
  /ip hotspot add name="lbbs-staff-hotspot" interface=bridge-staff address-pool=none profile=lbbs-staff-hotspot-profile keepalive-timeout=3m idle-timeout=none login-timeout=5m addresses-per-mac=2 disabled=yes
  :log info "LBBS40: Staff server created disabled"
} else={
  :log info "LBBS40: existing disabled Staff server reused"
}

# 3. POSTCHECK: still fail closed.
:local installedStaff [/ip hotspot find where name="lbbs-staff-hotspot"]
:if ([:len $installedStaff] != 1) do={ :error "LBBS40: Staff server missing after stage" }
:if (([/ip hotspot get $installedStaff interface] != "bridge-staff") || ([/ip hotspot get $installedStaff disabled] = false)) do={ :error "LBBS40: Staff server not staged safely" }
:if ([/ip hotspot user profile get [/ip hotspot user profile find where name="lbbs-staff-user-profile"] shared-users] != 2) do={ :error "LBBS40: two session cap not set" }
:if ([/ip firewall filter get $staffWanGate disabled] = false) do={ :error "LBBS40: Staff broad WAN gate was enabled" }
:if ([/ip hotspot get $clientsServer disabled] = true) do={ :error "LBBS40: Clients server changed unexpectedly" }

:log info "LBBS40 READY (STAGED): Staff portal original installed, server DISABLED, WAN BLOCKED, two session slots"
