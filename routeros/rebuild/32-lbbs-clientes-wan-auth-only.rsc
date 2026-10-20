# LBBS / RouterOS 7.23.8: authenticated-only Clients Internet gate.
# Confirmed production prerequisites (2026-10-19):
#  - Client bridge=bridge-hotspot, subnet=10.10.10.0/24, ether1=Starlink
#  - HotSpot server=lbbs-hotspot, customer profile=lbbs-client-profile
#  - router login verified through /ip hotspot active = 1 and Dashboard LOGIN
#  - customer broad WAN gate OFF and Staff broad WAN gate OFF
#
# This is a *limited operational pilot*: the absolute 3h expiry and 3-minute
# disconnect grace still need backend+router reconciliation. It does not
# claim to implement those policies. Never run old logout hooks.
#
# Matches only HotSpot authenticated client IPv4 packets, to Starlink WAN.
# It intentionally keeps default forward drop and Staff gate unchanged.
# Rule can be disabled for rollback without touching admin access.

:if ([:len [/ip hotspot find where name="lbbs-hotspot" and interface="bridge-hotspot" and disabled=no]] != 1) do={ :error "LBBS32: active client hotspot missing" }
:if ([:len [/ip firewall filter find where comment="LBBS-GATE customer WAN OFF until captive proven" and disabled=yes]] != 1) do={ :error "LBBS32: broad customer gate MUST stay disabled" }
:if ([:len [/ip firewall filter find where comment="LBBS-GATE staff WAN OFF until captive proven" and disabled=yes]] != 1) do={ :error "LBBS32: Staff WAN MUST stay disabled" }
:if ([:len [/ip firewall filter find where chain=forward and comment="LBBS captive preauth HTTPS exception"]] != 1) do={ :error "LBBS32: missing client preauth rule anchor" }
:if ([:len [/ip firewall filter find where chain=forward and comment="LBBS-BOOT-Forward-Drop"]] != 1) do={ :error "LBBS32: missing default drop" }
:if ([:len [/ip firewall filter find where comment="LBBS-CLIENTES-WAN-AUTH-ONLY"]] > 0) do={ :error "LBBS32: authenticated WAN gate already exists" }

/ip firewall filter add chain=forward action=accept src-address=10.10.10.0/24 in-interface=bridge-hotspot out-interface=ether1 hotspot=auth place-before=[find where comment="LBBS captive preauth HTTPS exception"] comment="LBBS-CLIENTES-WAN-AUTH-ONLY"
:log warning "LBBS32: authenticated-only Customer Internet pilot enabled. Staff WAN blocked; 3h absolute and 3m grace pending."
