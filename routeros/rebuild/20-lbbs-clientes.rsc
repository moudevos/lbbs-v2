# LBBS v2 - Clientes captive HotSpot; apply only after 00/10 network base.
# NO WAN bypass: LBBS-GATE customer WAN stays disabled pending an end-to-end test.
# Place portal resources in flash/lbbs-clients/ with:
#   login.html, md5.js, alogin.html, error.html, status.html, logout.html,
#   flogin.html, styles.css, assets/lbbs-logo.svg
# Account validation/rotation remains in Dashboard; do not create local vouchers here.
# Version target: RouterOS 7.23.8 hEX RB750Gr3.
# This is a ONE-TIME INSTALLER, not an idempotent update.

:if ([:len [/interface bridge find where name="bridge-hotspot"]] != 1) do={ :error "LBBS CLIENTS: customer bridge missing" }
:if ([:len [/ip address find where interface="bridge-hotspot" and address="10.10.10.1/24"]] != 1) do={ :error "LBBS CLIENTS: gateway missing" }
:if ([:len [/ip firewall filter find where comment="LBBS-BOOT-Forward-Drop"]] != 1) do={ :error "LBBS CLIENTS: missing default-deny" }
:if ([:len [/ip firewall filter find where comment="LBBS-GATE customer WAN OFF until captive proven"]] != 1) do={ :error "LBBS CLIENTS: missing controlled customer gate" }
:if ([:len [/ip hotspot find where name="lbbs-hotspot"]] > 0) do={ :error "LBBS CLIENTS: already installed" }
:if ([:len [/ip hotspot profile find where name="lbbs-hotspot-profile"]] > 0) do={ :error "LBBS CLIENTS: profile exists" }
:if ([:len [/ip hotspot user profile find where name="lbbs-client-profile"]] > 0) do={ :error "LBBS CLIENTS: user profile exists" }
:if ([:len [/file find where name="flash/lbbs-clients/login.html"]] != 1) do={ :error "LBBS CLIENTS: portal login.html missing" }
:if ([:len [/file find where name="flash/lbbs-clients/md5.js"]] != 1) do={ :error "LBBS CLIENTS: portal md5.js missing" }

# Local HTTP CHAP + no persistent cookies until 3-minute reconnection lifecycle
# is implemented end-to-end in RouterOS and Supabase.
/ip hotspot profile add name="lbbs-hotspot-profile" hotspot-address=10.10.10.1 dns-name="wifi.lbbs.test" login-by=http-chap html-directory="flash/lbbs-clients" use-radius=no comment="LBBS Clients CHAP portal"
/ip hotspot user profile add name="lbbs-client-profile" shared-users=1 session-timeout=3h keepalive-timeout=3m idle-timeout=none add-mac-cookie=no comment="LBBS Clients 3h max; grace requires separate reconciliation"
/ip hotspot add name="lbbs-hotspot" interface=bridge-hotspot address-pool=pool-hotspot profile=lbbs-hotspot-profile keepalive-timeout=3m idle-timeout=none login-timeout=5m addresses-per-mac=1 disabled=no comment="LBBS customer captive gateway"

# Frontend API requests and privacy pages are the ONLY permitted external hosts.
# IP list entries below are DNS-resolved; the HotSpot's walled garden performs
# hostname-level enforcement. Shared CDN IPs are not a substitute for TLS hostname ACL.
/ip hotspot walled-garden add dst-host="app.labajaditabarberstudio.com" action=allow comment="LBBS captive API"
/ip hotspot walled-garden add dst-host="web.labajaditabarberstudio.com" action=allow comment="LBBS legal pages"
/ip hotspot walled-garden ip add dst-host="app.labajaditabarberstudio.com" protocol=tcp dst-port=443 action=accept comment="LBBS captive HTTPS"
/ip hotspot walled-garden ip add dst-host="web.labajaditabarberstudio.com" protocol=tcp dst-port=443 action=accept comment="LBBS legal HTTPS"
/ip firewall address-list add list="LBBS-PREAUTH-CUSTOMERS" address=app.labajaditabarberstudio.com comment="LBBS captive Vercel IPv4"
/ip firewall address-list add list="LBBS-PREAUTH-CUSTOMERS" address=web.labajaditabarberstudio.com comment="LBBS legal Vercel IPv4"
/ip firewall filter add chain=forward action=accept in-interface=bridge-hotspot src-address=10.10.10.0/24 out-interface=ether1 protocol=tcp dst-port=443 dst-address-list="LBBS-PREAUTH-CUSTOMERS" place-before=[find where comment="LBBS-BOOT-Forward-Drop"] comment="LBBS captive preauth HTTPS exception"

:log warning "LBBS CLIENTS STAGED: login portal enabled, WAN gate OFF; provisioning and grace not yet deployed"
