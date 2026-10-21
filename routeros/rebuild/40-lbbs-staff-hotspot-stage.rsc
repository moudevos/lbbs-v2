# LBBS WiFi Staff / 40 - STAGE ONLY / RouterOS 7.23.8 hEX RB750Gr3.
# This installs a DISABLED Staff HotSpot, one Staff-only user profile,
# and NO WAN permit, no DNS/walled garden exception, no users or credentials.
# Does not modify Clientes, bridge, DHCP, NAT, firewall or Starlink.
# File preflight: flash/lbbs-staff/login.html (staging splash).
# One-time importer; do not reimport after success.

:if ([:len [/interface bridge find where name="bridge-staff"]] != 1) do={ :error "LBBS40: bridge-staff missing" }
:if ([:len [/interface bridge port find where bridge="bridge-staff" and interface="ether4"]] != 1) do={ :error "LBBS40: ether4 is not on bridge-staff" }
:if ([:len [/interface bridge port find where bridge="bridge-staff"]] != 1) do={ :error "LBBS40: unexpected staff bridge port" }
:if ([:len [/ip address find where interface="bridge-staff" and address="10.10.20.1/24"]] != 1) do={ :error "LBBS40: Staff gateway mismatch" }
:if ([:len [/ip dhcp-server find where name="dhcp-staff" and interface="bridge-staff" and disabled=no]] != 1) do={ :error "LBBS40: Staff DHCP missing/disabled" }
:if ([:len [/ip hotspot find where name="lbbs-hotspot" and interface="bridge-hotspot" and disabled=no]] != 1) do={ :error "LBBS40: Clientes hotspot not healthy" }
:if ([:len [/ip firewall filter find where comment="LBBS-GATE staff WAN OFF until captive proven" and disabled=yes]] != 1) do={ :error "LBBS40: broad Staff WAN gate must remain disabled" }
:if ([:len [/ip firewall filter find where comment="LBBS-BOOT-Forward-Drop" and disabled=no]] != 1) do={ :error "LBBS40: default forward deny not active" }
:if ([:len [/ip hotspot find where interface="bridge-staff"]] != 0) do={ :error "LBBS40: Staff hotspot already exists; stop" }
:if ([:len [/ip hotspot find where name="lbbs-staff-hotspot"]] != 0) do={ :error "LBBS40: Staff hotspot name already exists; stop" }
:if ([:len [/ip hotspot profile find where name="lbbs-staff-hotspot-profile"]] != 0) do={ :error "LBBS40: Staff hotspot profile already exists; stop" }
:if ([:len [/ip hotspot user profile find where name="lbbs-staff-user-profile"]] != 0) do={ :error "LBBS40: Staff user profile already exists; stop" }
:if ([:len [/file find where name="flash/lbbs-staff/login.html"]] != 1) do={ :error "LBBS40: staging splash flash/lbbs-staff/login.html missing" }

# A dedicated HotSpot profile, scoped only to the Staff AP network.
# No shared staff passwords and no cookie login during the STAGING phase.
/ip hotspot profile add name="lbbs-staff-hotspot-profile" hotspot-address=10.10.20.1 dns-name="wifi-staff.lbbs.test" login-by=http-chap html-directory="flash/lbbs-staff" use-radius=no
/ip hotspot user profile add name="lbbs-staff-user-profile" shared-users=1 idle-timeout=none keepalive-timeout=3m add-mac-cookie=no
/ip hotspot add name="lbbs-staff-hotspot" interface=bridge-staff address-pool=none profile=lbbs-staff-hotspot-profile keepalive-timeout=3m idle-timeout=none login-timeout=5m addresses-per-mac=2 disabled=yes comment="LBBS40 Staff disabled until auth and WAN are proven"

:if ([:len [/ip hotspot find where name="lbbs-staff-hotspot" and disabled=yes]] != 1) do={ :error "LBBS40: staged server verification failed" }
:if ([:len [/ip firewall filter find where comment="LBBS-GATE staff WAN OFF until captive proven" and disabled=yes]] != 1) do={ :error "LBBS40: Staff WAN gate changed unexpectedly" }
:log info "LBBS40: Staff hotspot staged and DISABLED; no Staff WAN, no users, no Clientes changes"
