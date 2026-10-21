# LBBS Staff pilot rollback v50c. SAFE: only Staff, no Clientes modifications.
# Can be re-run. From Ethernet management or WinBox admin.
:local st [/ip hotspot find where name="lbbs-staff-hotspot"]
:if ([:len $st] = 1) do={ /ip hotspot disable $st }
:local ss [/system scheduler find where name="lbbs-staff-sync"]
:if ([:len $ss] = 1) do={ /system scheduler disable $ss }
:local hs [/system scheduler find where name="lbbs-staff-hosts-v42"]
:if ([:len $hs] = 1) do={ /system scheduler disable $hs }

# Remove ONLY our dedicated rules by exact ownership labels.
:local owned [/ip firewall filter find where comment="LBBS-STAFF-V50-FWD-JUMP"]
:if ([:len $owned] > 0) do={ /ip firewall filter remove $owned }
:local owned [/ip firewall filter find where comment="LBBS-STAFF-V50-INPUT-MGMT-DROP"]
:if ([:len $owned] > 0) do={ /ip firewall filter remove $owned }
:local owned [/ip firewall filter find where comment="LBBS-STAFF-V50-PRIVATE-10"]
:if ([:len $owned] > 0) do={ /ip firewall filter remove $owned }
:local owned [/ip firewall filter find where comment="LBBS-STAFF-V50-PRIVATE-172"]
:if ([:len $owned] > 0) do={ /ip firewall filter remove $owned }
:local owned [/ip firewall filter find where comment="LBBS-STAFF-V50-PRIVATE-192"]
:if ([:len $owned] > 0) do={ /ip firewall filter remove $owned }
:local owned [/ip firewall filter find where comment="LBBS-STAFF-V50-PREAUTH-API"]
:if ([:len $owned] > 0) do={ /ip firewall filter remove $owned }
:local owned [/ip firewall filter find where comment="LBBS-STAFF-V50-AUTH-WAN"]
:if ([:len $owned] > 0) do={ /ip firewall filter remove $owned }
:local owned [/ip firewall filter find where comment="LBBS-STAFF-V50-DEFAULT-DROP"]
:if ([:len $owned] > 0) do={ /ip firewall filter remove $owned }
:local owned [/ip firewall nat find where comment="LBBS-STAFF-V50-NAT"]
:if ([:len $owned] > 0) do={ /ip firewall nat remove $owned }
:local owned [/ipv6 firewall filter find where comment="LBBS-STAFF-V50-IPV6-FWD-DROP"]
:if ([:len $owned] > 0) do={ /ipv6 firewall filter remove $owned }
:local owned [/ipv6 firewall filter find where comment="LBBS-STAFF-V50-IPV6-INPUT-DROP"]
:if ([:len $owned] > 0) do={ /ipv6 firewall filter remove $owned }
:local owned [/ip hotspot walled-garden ip find where comment="LBBS-STAFF-V50-WALLED-API" and server="lbbs-staff-hotspot"]
:if ([:len $owned] > 0) do={ /ip hotspot walled-garden ip remove $owned }
:local owned [/ip firewall address-list find where list="lbbs-staff-v50-api" and comment="LBBS-STAFF-V50-API-DNS"]
:if ([:len $owned] > 0) do={ /ip firewall address-list remove $owned }
:put "LBBS-STAFF-V50C-ROLLBACK=completed"
:put ("LBBS-STAFF-HOTSPOT-DISABLED=" . [/ip hotspot get $st disabled])
:put ("LBBS-STAFF-SYNC-DISABLED=" . [/system scheduler get $ss disabled])
:local clients [/ip hotspot find where name="lbbs-hotspot"]
:put ("LBBS-CLIENTES-DISABLED=" . [/ip hotspot get $clients disabled])
