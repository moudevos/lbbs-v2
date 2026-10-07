:global LBBS_API_BASE_URL
:global LBBS_ROUTER_TOKEN
:local tag [/ip hotspot user get [find where name=$user] comment]
:if ([:pick $tag 0 5] = "LBBS:") do={
 :local voucherId [:pick $tag 5 [:len $tag]]
 :local payload {"voucherId"=$voucherId;"mac"=$"mac-address";"ip"=$address;"event"="LOGIN";"metadata"={"router"="RouterOS"}}
 :do { /tool fetch url=($LBBS_API_BASE_URL . "/api/wifi/router/session") http-method=post http-header-field=("Content-Type: application/json,Authorization: Bearer " . $LBBS_ROUTER_TOKEN) http-data=[:serialize to=json value=$payload] check-certificate=yes output=none } on-error={ :log warning "LBBS: LOGIN no enviado" }
}
