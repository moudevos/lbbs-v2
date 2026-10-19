# LBBS RouterOS 7.23.8 / RB750Gr3 (mmips)
# 00 - Recovery bootstrap for Netinstall CONFIGURE SCRIPT on a CLEAN installation.
# Intended ONLY for a Netinstall without restored configuration or factory defaults.
# Recovery entry: ether2/ether3, 192.168.88.1, WinBox (TCP or MAC).
# NO Starlink, HotSpot, Staff, vouchers, API credentials, or portal yet.
# IMPORTANT: Preserve the administrator's password; this script deliberately sets none.

:delay 5s
:if ([:len [/interface bridge find]] > 0) do={ :error "LBBS BOOT: bridge already exists; require clean Netinstall" }
:if ([:len [/ip address find]] > 0) do={ :error "LBBS BOOT: IP already configured; require clean Netinstall" }
:if ([:len [/ip firewall filter find]] > 0) do={ :error "LBBS BOOT: firewall rules already exist" }
:if ([:len [/ip dhcp-server find]] > 0) do={ :error "LBBS BOOT: DHCP server already exists" }

/system identity set name="LBBS-hEX"
/interface bridge add name=bridge-admin protocol-mode=rstp comment="LBBS administration"
/interface bridge port add bridge=bridge-admin interface=ether2
/interface bridge port add bridge=bridge-admin interface=ether3
/interface list add name=LBBS-MGMT comment="LBBS physical management bridge only"
/interface list member add list=LBBS-MGMT interface=bridge-admin
/ip address add address=192.168.88.1/24 interface=bridge-admin comment="LBBS admin gateway"
/ip pool add name=pool-admin ranges=192.168.88.100-192.168.88.200
/ip dhcp-server network add address=192.168.88.0/24 gateway=192.168.88.1 dns-server=192.168.88.1 comment="LBBS admin"
/ip dhcp-server add name=dhcp-admin interface=bridge-admin address-pool=pool-admin lease-time=1h disabled=no

# Only WinBox is intentionally available for first login (admin password set manually).
:foreach svc in={"ftp";"telnet";"www";"www-ssl";"api";"api-ssl";"ssh";"reverse-proxy"} do={
  :if ([:len [/ip service find where name=$svc]] > 0) do={ /ip service disable [find where name=$svc] }
}
/ip service set [find where name="winbox"] address=192.168.88.0/24 disabled=no
/tool mac-server set allowed-interface-list=none
/tool mac-server mac-winbox set allowed-interface-list=LBBS-MGMT
/ip neighbor discovery-settings set discover-interface-list=LBBS-MGMT
/tool bandwidth-server set enabled=no

# Deny inbound/routed IPv4 by default. DHCP admin is permitted before deny.
/ip firewall filter add chain=input action=accept connection-state=established,related,untracked comment="LBBS-BOOT input established"
/ip firewall filter add chain=input action=drop connection-state=invalid comment="LBBS-BOOT input invalid"
/ip firewall filter add chain=input action=accept in-interface=bridge-admin protocol=udp dst-port=67 comment="LBBS-BOOT admin DHCP"
/ip firewall filter add chain=input action=accept in-interface=bridge-admin src-address=192.168.88.0/24 comment="LBBS-BOOT admin to router"
/ip firewall filter add chain=input action=drop comment="LBBS-BOOT-Input-Drop"
/ip firewall filter add chain=forward action=accept connection-state=established,related,untracked comment="LBBS-BOOT forward established"
/ip firewall filter add chain=forward action=drop connection-state=invalid comment="LBBS-BOOT forward invalid"
/ip firewall filter add chain=forward action=drop comment="LBBS-BOOT-Forward-Drop"

:log warning "LBBS BOOT READY: connect via ether2 to 192.168.88.1; secure administrator account"
