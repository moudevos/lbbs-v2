# LBBS Staff 43 - NONDESTRUCTIVE diagnosis for MikroTik hEX RouterOS 7.
# Only reads a router-authenticated, read-only Staff health endpoint.
# Never changes routes, users, firewall, HotSpots or schedulers.
# Never prints Bearer tokens, secrets, credentials, URLs or response bodies.

:global lbbsApiBaseUrl
:global lbbsRouterToken
:put ("staff_url_set=" . ([:len $lbbsApiBaseUrl] > 0))
:put ("staff_token_set=" . ([:len $lbbsRouterToken] > 0))

:if ([:len $lbbsApiBaseUrl] = 0 || [:len $lbbsRouterToken] = 0) do={
  :put "staff_result=router_env_missing"
} else={
  :local stage "fetch"
  :onerror lbbsHealthError in={
    :local headers ("Content-Type: application/json,Authorization: Bearer " . $lbbsRouterToken)
    :local fetched [/tool fetch url=($lbbsApiBaseUrl . "/api/wifi/router/staff/health") http-method=post http-header-field=$headers http-data="{}" output=user as-value check-certificate=yes]
    :set stage "decode"
    :local response [:deserialize from=json options=json.no-string-conversion value=($fetched->"data")]
    :if (($response->"mode") != "staff-health-v1") do={ :error "unexpected_staff_health_mode" }
    :put ("staff_health_state=" . ($response->"state"))
    :if (($response->"state") = "ready") do={
      :put ("staff_authorized_device_count=" . ($response->"deviceCount"))
    }
  } do={
    :local errText [:tostr $lbbsHealthError]
    :put ("staff_failed_stage=" . $stage)
    :if ([:find $errText "401"] != nil) do={
      :put "staff_failure=http_401_router_token"
    } else={
      :if ([:find $errText "403"] != nil) do={
        :put "staff_failure=http_403_router_inactive_or_blocked"
      } else={
        :if ([:find $errText "404"] != nil) do={
          :put "staff_failure=http_404_endpoint_not_deployed"
        } else={
          :if ([:find $errText "503"] != nil) do={
            :put "staff_failure=http_503_backend"
          } else={
            :if ([:find $errText "500"] != nil) do={
              :put "staff_failure=http_500_backend"
            } else={
              :if ([:find $errText "certificate"] != nil || [:find $errText "SSL"] != nil || [:find $errText "TLS"] != nil) do={
                :put "staff_failure=certificate_or_tls"
              } else={
                :if ([:find $errText "dns"] != nil || [:find $errText "resolve"] != nil) do={
                  :put "staff_failure=dns_resolution"
                } else={
                  :put "staff_failure=other_transport_or_response"
                }
              }
            }
          }
        }
      }
    }
  }
}
