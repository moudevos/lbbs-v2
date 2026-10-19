# LBBS RouterOS 7.23.8 / RB750Gr3 (mmips)
# 10 - One-time network build AFTER 00 bootstrap and verified ether2 WinBox login.
# Starlink ether1; Staff ether4; Customers ether5. NO HotSpot is installed here.
# FAIL CLOSED: Clients & Staff get DHCP/DNS but NO WAN until their HotSpots are tested.
# Non-idempotent on purpose: checks clean expected bootstrap before any changes.

:if ([:len [/interface bridge find where name="bridge-admin"]] != 1) do={ :error "LBBS BASE: bootstrap admin bridge missing" }
:if ([:len [/ip firewall filter find where comment="LBBS-BOOT-Input-Drop"]] != 1) do={ :error "LBBS BASE: bootstrap input firewall missing" }
:if ([:len [/ip firewall filter find where comment="LBBS-BOOT-Forward-Drop"]] != 1) do={ :error "LBBS BASE: bootstrap forward firewall missing" }
:if ([:len [/interface bridge find where name="bridge-hotspot"]] > 0) do={ :error "LBBS BASE: customer bridge already exists" }
:if ([:len [/interface bridge find where name="bridge-staff"]] > 0) do={ :error "LBBS BASE: staff bridge already exists" }
:if ([:len [/ip dhcp-client find]] > 0) do={ :error "LBBS BASE: DHCP WAN client already exists" }
:if ([:len [/ip hotspot find]] > 0) do={ :error "LBBS BASE: hotspot already exists" }
:if ([:len [/ip firewall nat find]] > 0) do={ :error "LBBS BASE: NAT rules already exist" }
:if ([:len [/ip firewall filter find where comment="LBBS-BASE admin to WAN"]] > 0) do={ :error "LBBS BASE: already applied" }

# Dedicated physical Layer 2 domains: no VLANs and no bridge between the two APs.
/interface bridge add name=bridge-hotspot protocol-mode=rstp comment="LBBS customers only"
/interface bridge port add bridge=bridge-hotspot interface=ether5
/interface bridge add name=bridge-staff protocol-mode=rstp comment="LBBS staff only"
/interface bridge port add bridge=bridge-staff interface=ether4
/interface list add name=LBBS-WAN comment="Starlink uplink only"
/interface list member add list=LBBS-WAN interface=ether1
/interface list add name=LBBS-CUSTOMERS comment="LBBS customers"
/interface list member add list=LBBS-CUSTOMERS interface=bridge-hotspot
/interface list add name=LBBS-STAFF comment="LBBS staff"
/interface list member add list=LBBS-STAFF interface=bridge-staff

/ip address add address=10.10.10.1/24 interface=bridge-hotspot comment="LBBS customers gateway"
/ip address add address=10.10.20.1/24 interface=bridge-staff comment="LBBS staff gateway"
/ip pool add name=pool-hotspot ranges=10.10.10.10-10.10.10.250
/ip pool add name=pool-staff ranges=10.10.20.100-10.10.20.250
/ip dhcp-server network add address=10.10.10.0/24 gateway=10.10.10.1 dns-server=10.10.10.1 comment="LBBS customers"
/ip dhcp-server network add address=10.10.20.0/24 gateway=10.10.20.1 dns-server=10.10.20.1 comment="LBBS staff"
/ip dhcp-server add name=dhcp-hotspot interface=bridge-hotspot address-pool=pool-hotspot lease-time=10m disabled=no
/ip dhcp-server add name=dhcp-staff interface=bridge-staff address-pool=pool-staff lease-time=1h disabled=no

# Router performs local DNS; firewall below excludes WAN-origin queries.
/ip dns set servers=1.1.1.1,8.8.8.8 allow-remote-requests=yes
/ip dhcp-client add interface=ether1 add-default-route=yes use-peer-dns=no use-peer-ntp=no disabled=no comment="LBBS Starlink"

# Add ONLY before the bootstrap's terminal denies; no broad inter-segment permits.
/ip firewall filter add chain=input action=accept in-interface=ether1 protocol=udp src-port=67 dst-port=68 place-before=[find where comment="LBBS-BOOT-Input-Drop"] comment="LBBS-BASE Starlink DHCP response"
/ip firewall filter add chain=input action=accept in-interface=bridge-admin protocol=udp dst-port=53 place-before=[find where comment="LBBS-BOOT-Input-Drop"] comment="LBBS-BASE admin DNS UDP"
/ip firewall filter add chain=input action=accept in-interface=bridge-admin protocol=tcp dst-port=53 place-before=[find where comment="LBBS-BOOT-Input-Drop"] comment="LBBS-BASE admin DNS TCP"
/ip firewall filter add chain=input action=accept in-interface=bridge-hotspot protocol=udp dst-port=53,67 place-before=[find where comment="LBBS-BOOT-Input-Drop"] comment="LBBS-BASE clients DHCP DNS"
/ip firewall filter add chain=input action=accept in-interface=bridge-hotspot protocol=tcp dst-port=53,64872-64875 place-before=[find where comment="LBBS-BOOT-Input-Drop"] comment="LBBS-BASE clients HotSpot DNS portal"
/ip firewall filter add chain=input action=accept in-interface=bridge-hotspot protocol=udp dst-port=64872 place-before=[find where comment="LBBS-BOOT-Input-Drop"] comment="LBBS-BASE clients HotSpot DNS redirect"
/ip firewall filter add chain=input action=accept in-interface=bridge-staff protocol=udp dst-port=53,67 place-before=[find where comment="LBBS-BOOT-Input-Drop"] comment="LBBS-BASE staff DHCP DNS"
/ip firewall filter add chain=input action=accept in-interface=bridge-staff protocol=tcp dst-port=53,64872-64875 place-before=[find where comment="LBBS-BOOT-Input-Drop"] comment="LBBS-BASE staff HotSpot DNS portal"
/ip firewall filter add chain=input action=accept in-interface=bridge-staff protocol=udp dst-port=64872 place-before=[find where comment="LBBS-BOOT-Input-Drop"] comment="LBBS-BASE staff HotSpot DNS redirect"

# No FastTrack: avoid bypassing HotSpot enforcement / accounting.
/ip firewall filter add chain=forward action=accept in-interface=bridge-admin src-address=192.168.88.0/24 out-interface=ether1 place-before=[find where comment="LBBS-BOOT-Forward-Drop"] comment="LBBS-BASE admin to WAN"
/ip firewall filter add chain=forward action=accept in-interface=bridge-hotspot src-address=10.10.10.0/24 out-interface=ether1 disabled=yes place-before=[find where comment="LBBS-BOOT-Forward-Drop"] comment="LBBS-GATE customer WAN OFF until captive proven"
/ip firewall filter add chain=forward action=accept in-interface=bridge-staff src-address=10.10.20.0/24 out-interface=ether1 disabled=yes place-before=[find where comment="LBBS-BOOT-Forward-Drop"] comment="LBBS-GATE staff WAN OFF until captive proven"

# Single NAT rule; NAT never grants access on its own.
/ip firewall nat add chain=srcnat action=masquerade out-interface=ether1 comment="LBBS-BASE single Starlink NAT"

# IPv6 is not designed for the captive portal yet: prohibit IPv6 routing.
/ipv6 settings set disable-ipv6=yes
/system clock set time-zone-name=America/Lima time-zone-autodetect=no
/system ntp client set enabled=yes
:if ([:len [/system ntp client servers find where address="time.cloudflare.com"]] = 0) do={ /system ntp client servers add address=time.cloudflare.com }

:log warning "LBBS BASE READY: admin WAN may work; Customer/Staff WAN intentionally DISABLED"
