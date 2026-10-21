# LBBS Staff v42 - READ-ONLY DIAGNOSTIC of Staff desired API.
# No HotSpot/users/firewall/scheduler writes. Never prints tokens/passwords.
# Can run even when lbbs-staff-hotspot is disabled.
:global lbbsApiBaseUrl
:global lbbsRouterToken
:put ("staff_backend_url_set=" . ([:len $lbbsApiBaseUrl] > 0))
:put ("staff_router_token_set=" . ([:len $lbbsRouterToken] > 0))

:if ([:len $lbbsApiBaseUrl] > 0 && [:len $lbbsRouterToken] > 0) do={
  :local stage "fetch"
  :onerror diagnosticError in={
    :local headers ("Content-Type: application/json,Authorization: Bearer " . $lbbsRouterToken)
    :local result [/tool fetch url=($lbbsApiBaseUrl . "/api/wifi/router/staff/desired") http-method=post http-header-field=$headers http-data="{}" check-certificate=yes output=user as-value]
    :set stage "decode"
    :local response [:deserialize from=json options=json.no-string-conversion value=($result->"data")]
    :local mode ($response->"mode")
    :if ($mode != "staff-v41") do={
      :put "staff_api_mode_invalid"
    } else={
      :put "staff_api_mode=staff-v41"
      :put ("staff_device_count=" . [:len ($response->"devices")])
      :put ("staff_revision_present=" . ([:len ($response->"revision")] = 64))
    }
  } do={
    :put ("staff_api_failed_stage=" . $stage)
    :put "Check deployment, feature flag and Vercel Staff provisioning key; no secrets were printed."
  }
}
