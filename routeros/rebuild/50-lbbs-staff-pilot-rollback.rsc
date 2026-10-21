# LBBS Staff pilot rollback v50. SAFE: only Staff, no Clientes modifications.
# Can be re-run. From Ethernet management or WinBox admin.
:local st [/ip hotspot find where name="lbbs-staff-hotspot"]
:if ([:len $st] = 1) do={ /ip hotspot disable $st }
:local ss [/system scheduler find where name="lbbs-staff-sync"]
:if ([:len $ss] = 1) do={ /system scheduler disable $ss }
:local hs [/system scheduler find where name="lbbs-staff-hosts-v42"]
:if ([:len $hs] = 1) do={ /system scheduler disable $hs }

# Remove ONLY our dedicated rules by exact ownership labels.
/ip firewall filter remove [find where comment="LBBS-STAFF-V50-FWD-JUMP"]
/ip firewall filter remove [find where comment="LBBS-STAFF-V50-INPUT-MGMT-DROP"]
/ip firewall filter remove [find where comment="LBBS-STAFF-V50-PRIVATE-10"]
/ip firewall filter remove [find where comment="LBBS-STAFF-V50-PRIVATE-172"]
/ip firewall filter remove [find where comment="LBBS-STAFF-V50-PRIVATE-192"]
/ip firewall filter remove [find where comment="LBBS-STAFF-V50-PREAUTH-API"]
/ip firewall filter remove [find where comment="LBBS-STAFF-V50-AUTH-WAN"]
/ip firewall filter remove [find where comment="LBBS-STAFF-V50-DEFAULT-DROP"]
/ip firewall nat remove [find where comment="LBBS-STAFF-V50-NAT"]
/ipv6 firewall filter remove [find where comment="LBBS-STAFF-V50-IPV6-FWD-DROP"]
/ipv6 firewall filter remove [find where comment="LBBS-STAFF-V50-IPV6-INPUT-DROP"]
/ip hotspot walled-garden ip remove [find where comment="LBBS-STAFF-V50-WALLED-API" and server="lbbs-staff-hotspot"]
/ip firewall address-list remove [find where list="lbbs-staff-v50-api" and comment="LBBS-STAFF-V50-API-DNS"]
:put "LBBS-STAFF-V50-ROLLBACK=completed"
:put ("LBBS-STAFF-HOTSPOT-DISABLED=" . [/ip hotspot get $st disabled])
:put ("LBBS-STAFF-SYNC-DISABLED=" . [/system scheduler get $ss disabled])
:local clients [/ip hotspot find where name="lbbs-hotspot"]
:put ("LBBS-CLIENTES-DISABLED=" . [/ip hotspot get $clients disabled])
