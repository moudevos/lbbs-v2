# RouterOS v7 server-side heartbeat. No client sessions are transmitted here.
:global LBBS_API_BASE_URL
:global LBBS_ROUTER_TOKEN
:local headers ("Content-Type: application/json,Authorization: Bearer " . $LBBS_ROUTER_TOKEN)
:local version [/system resource get version]
:local model [/system routerboard get model]
:local uptime [/system resource get uptime]
:local payload {"routerosVersion"=$version;"model"=$model;"uptime"=$uptime}
:do { /tool fetch url=($LBBS_API_BASE_URL . "/api/wifi/router/heartbeat") http-method=post http-header-field=$headers http-data=[:serialize to=json value=$payload] check-certificate=yes output=none } on-error={ :log warning "LBBS heartbeat failure" }
