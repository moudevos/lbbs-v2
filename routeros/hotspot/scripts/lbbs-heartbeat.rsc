# Installs/updates the LBBS heartbeat script on RouterOS v7.
/system script remove [find where name="lbbs-heartbeat"]
/system script add name="lbbs-heartbeat" policy=ftp,read,write,policy,test,sensitive source={
  :global lbbsApiBaseUrl
  :global lbbsRouterToken

  :if ([:len $lbbsApiBaseUrl] = 0 || [:len $lbbsRouterToken] = 0) do={
    :log warning "LBBS: heartbeat sin configuracion"
    :error "lbbs_not_configured"
  }

  :local headers ("Content-Type: application/json,Authorization: Bearer " . $lbbsRouterToken)
  :local routerVersion [/system resource get version]
  :local routerModel [/system routerboard get model]
  :local routerUptime [/system resource get uptime]
  :local payload {"routerosVersion"=$routerVersion;"model"=$routerModel;"uptime"=$routerUptime}

  :do {
    /tool fetch url=($lbbsApiBaseUrl . "/api/wifi/router/heartbeat") http-method=post http-header-field=$headers http-data=[:serialize to=json value=$payload] check-certificate=yes output=none
  } on-error={
    :log warning "LBBS: heartbeat fallido"
  }
}
