# Local invalidation happens before the HTTP request.
:global LBBS_API_BASE_URL
:global LBBS_ROUTER_TOKEN
:local tag [/ip hotspot user get [find where name=$user] comment]
:if ([:pick $tag 0 5] = "LBBS:") do={
 :local voucherId [:pick $tag 5 [:len $tag]]
 /ip hotspot cookie remove [find where mac-address=$"mac-address"]
 /ip hotspot user remove [find where name=$user]
 :local payload {"voucherId"=$voucherId;"mac"=$"mac-address";"ip"=$address;"event"="LOGOUT";"metadata"={"reason"="keepalive_or_session_timeout"}}
 :do { /tool fetch url=($LBBS_API_BASE_URL . "/api/wifi/router/session") http-method=post http-header-field=("Content-Type: application/json,Authorization: Bearer " . $LBBS_ROUTER_TOKEN) http-data=[:serialize to=json value=$payload] check-certificate=yes output=none } on-error={ :log warning "LBBS: LOGOUT no enviado; acceso invalidado localmente" }
}
