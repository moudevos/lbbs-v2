# LBBS Clientes - registration-only LOGIN hook plus live-session reconciliation.
# Compatible with installed RouterOS 7.23.8 HotSpot / LBBS backend.
# Does not alter WAN, firewall, HotSpot login method, cookies or logout behavior.
# Never install legacy lbbs-install-session-hooks.rsc: it revokes on logout.
# Install ONCE. On partial/error do not reimport blindly.

:local p [/ip hotspot user profile find where name="lbbs-client-profile"]
:if ([:len $p] != 1) do={ :error "LBBS31: user profile missing" }
:if ([:len [/ip hotspot find where name="lbbs-hotspot"]] != 1) do={ :error "LBBS31: hotspot server missing" }
:if ([:len [/system script find where name="lbbs-env"]] != 1) do={ :error "LBBS31: env script missing" }
:if ([:len [/ip hotspot user profile get $p on-login]] > 0) do={ :error "LBBS31: on-login already set; inspect before continuing" }
:if ([:len [/ip hotspot user profile get $p on-logout]] > 0) do={ :error "LBBS31: unsafe on-logout already set; inspect before continuing" }

/system script run lbbs-env
:global lbbsApiBaseUrl
:global lbbsRouterToken
:if ([:len $lbbsApiBaseUrl] = 0 || [:len $lbbsRouterToken] = 0) do={ :error "LBBS31: missing runtime authentication" }

# HotSpot on-login event exposes the local $user, $"mac-address", $address.
# Store the hook inline, as invoked system scripts do not receive event locals.
:local loginScript ":global lbbsApiBaseUrl;:global lbbsRouterToken;:local u \$user;:local m \$\"mac-address\";:local ip \$address;:if ([:len \$lbbsApiBaseUrl] > 0 && [:len \$lbbsRouterToken] > 0) do={:local i [/ip hotspot user find where name=\$u and server=\"lbbs-hotspot\"];:if ([:len \$i] = 1) do={:local tag [/ip hotspot user get \$i comment];:if ([:pick \$tag 0 5] = \"LBBS:\") do={:local id [:pick \$tag 5 [:len \$tag]];:local payload {\"voucherId\"=\$id;\"mac\"=\$m;\"ip\"=\$ip;\"event\"=\"LOGIN\";\"metadata\"={\"source\"=\"hotspot_on_login\"}};:do {:local res [/tool fetch url=(\$lbbsApiBaseUrl . \"/api/wifi/router/session\") http-method=post http-header-field=(\"Content-Type: application/json,Authorization: Bearer \" . \$lbbsRouterToken) http-data=[:serialize to=json value=\$payload] check-certificate=yes output=user as-value];:local body [:deserialize from=json options=json.no-string-conversion value=(\$res->\"data\")];:if ((\$body->\"status\") != \"active\") do={:log warning \"LBBS31: LOGIN confirmation not active\"}} on-error={:log warning \"LBBS31: LOGIN event request failed\"}}}}"

/ip hotspot user profile set $p on-login=$loginScript
:log info "LBBS31: login hook installed; logout untouched"

# Existing connections preceded the hook and need a one-time honest LOGIN event.
:local endpoint ($lbbsApiBaseUrl . "/api/wifi/router/session")
:local headers ("Content-Type: application/json,Authorization: Bearer " . $lbbsRouterToken)
:local successes 0
:foreach activeId in=[/ip hotspot active find where server="lbbs-hotspot"] do={
  :local u [/ip hotspot active get $activeId user]
  :local m [:tostr [/ip hotspot active get $activeId mac-address]]
  :local ip [:tostr [/ip hotspot active get $activeId address]]
  :local userId [/ip hotspot user find where name=$u and server="lbbs-hotspot"]
  :if ([:len $userId] = 1) do={
    :local tag [/ip hotspot user get $userId comment]
    :if ([:pick $tag 0 5] = "LBBS:") do={
      :local id [:pick $tag 5 [:len $tag]]
      :local payload {"voucherId"=$id;"mac"=$m;"ip"=$ip;"event"="LOGIN";"metadata"={"source"="lbbs31_reconciliation"}}
      :do {
        :local res [/tool fetch url=$endpoint http-method=post http-header-field=$headers http-data=[:serialize to=json value=$payload] check-certificate=yes output=user as-value]
        :local body [:deserialize from=json options=json.no-string-conversion value=($res->"data")]
        :if (($body->"status") = "active") do={
          :set successes ($successes + 1)
        } else={
          :log warning "LBBS31: reconciliation returned non-active status"
        }
      } on-error={
        :log warning "LBBS31: reconciliation request failed"
      }
    }
  }
}
:log info ("LBBS31: confirmed active sessions=" . $successes)
