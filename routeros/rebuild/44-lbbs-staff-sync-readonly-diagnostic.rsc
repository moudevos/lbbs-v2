# LBBS Staff 44 - read-only diagnosis of failed phase41 sync.
# RouterOS 7.23.x. No writes: never creates accounts, ACKs, firewall rules,
# schedulers, HotSpots, MAC cookies, or sessions.
# No secrets, usernames, MACs, documents, hashes or raw errors are printed.

:global lbbsApiBaseUrl
:global lbbsRouterToken
:local stage "start"
:local response
:local entryCount 0
:local statusCode "none"

:if ([:len $lbbsApiBaseUrl] = 0 || [:len $lbbsRouterToken] = 0) do={
  :put "staff44_result=router_env_missing"
} else={
  :onerror problem,attributes in={
    :local srv [/ip hotspot find where name="lbbs-staff-hotspot"]
    :set stage "staff_server_preflight"
    :if ([:len $srv] != 1) do={ :error "staff_server_not_found" }
    :if (([/ip hotspot get $srv interface] != "bridge-staff") || ([/ip hotspot get $srv disabled] = false)) do={ :error "staff_server_not_staged" }

    :set stage "profile_preflight"
    :if ([:len [/ip hotspot user profile find where name="lbbs-staff-user-profile"]] != 1) do={ :error "staff_user_profile_missing" }

    :set stage "fetch_desired"
    :local hdr ("Content-Type: application/json,Authorization: Bearer " . $lbbsRouterToken)
    :local fetched [/tool fetch url=($lbbsApiBaseUrl . "/api/wifi/router/staff/desired") http-method=post http-header-field=$hdr http-data="{}" check-certificate=yes output=user as-value]

    :set stage "json_decode"
    :set response [:deserialize from=json options=json.no-string-conversion value=($fetched->"data")]

    :set stage "response_mode"
    :if (($response->"mode") != "staff-v41") do={ :error "wrong_mode" }

    :set stage "revision_validate"
    :local revision ($response->"revision")
    :if ([:typeof $revision] != "str" || [:len $revision] != 64) do={ :error "revision_invalid" }

    :set stage "roster_validate"
    :local roster ($response->"devices")
    :if ([:typeof $roster] != "array") do={ :error "roster_not_array" }
    :set entryCount [:len $roster]
    :if ($entryCount > 150) do={ :error "roster_too_large" }

    :set stage "entry_validate"
    :local desiredNames [:toarray ""]
    :foreach entry in=$roster do={
      :local username ($entry->"username")
      :local mac ($entry->"mac")
      :local secret ($entry->"password")
      :local deviceId ($entry->"deviceId")
      :local credentialId ($entry->"credentialId")
      :if ([:typeof $username] != "str" || [:len $username] != 35 || [:pick $username 0 3] != "sf_") do={ :error "invalid_username" }
      :if ([:typeof $mac] != "str" || [:len $mac] != 17) do={ :error "invalid_mac" }
      :if ([:typeof $secret] != "str" || [:len $secret] != 40) do={ :error "invalid_password" }
      :if ([:typeof $deviceId] != "str" || [:len $deviceId] != 36 || [:typeof $credentialId] != "str" || [:len $credentialId] != 36) do={ :error "invalid_device_identity" }
      :if ([:find $desiredNames $username] != nil) do={ :error "duplicate_username" }
      :set desiredNames ($desiredNames, $username)

      :set stage "existing_user_lookup"
      :local allMatches [/ip hotspot user find where name=$username]
      :local matches [/ip hotspot user find where name=$username and server="lbbs-staff-hotspot"]
      :if ([:len $allMatches] != [:len $matches]) do={ :error "foreign_user_collision" }
      :if ([:len $matches] > 1) do={ :error "duplicate_local_user" }
      :if ([:len $matches] = 1) do={
        :local existingTag [/ip hotspot user get $matches comment]
        :if ([:pick $existingTag 0 10] != "LBBSSTAFF:") do={ :error "untagged_existing_user" }
      }
      :set stage "entry_validate"
    }

    :set stage "ack_serialization_readonly"
    :local ack [:serialize to=json options=json.no-string-conversion value={"revision"=$revision;"complete"=true}]
    :if ([:len $ack] < 70) do={ :error "ack_serialization_invalid" }

    :put "staff44_result=readonly_preflight_ok"
    :put ("staff44_expected_devices=" . $entryCount)
    :put "staff44_next_step=provision_or_ack_requires_instrumentation"
  } do={
    :set statusCode ($attributes->"code")
    :put ("staff44_failed_stage=" . $stage)
    :if ([:typeof $statusCode] = "num") do={
      :put ("staff44_http_status=" . $statusCode)
    } else={
      :put "staff44_http_status=not_provided"
    }
    :put "staff44_result=stopped_without_changes"
  }
}
