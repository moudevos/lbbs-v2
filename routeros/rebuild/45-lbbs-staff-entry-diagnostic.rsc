# LBBS45 / RouterOS 7.23.x - staff entry parser diagnostic, READ-ONLY
# Authenticates the router and tests each Staff roster field separately.
# NEVER prints document, usernames, MACs, PIN, passwords, token, or JSON.
# Does not create/modify users, sessions, firewall, schedulers, or HotSpots.

:global lbbsApiBaseUrl
:global lbbsRouterToken
:local stage "start"
:local entryNumber 0

:if ([:len $lbbsApiBaseUrl] = 0 || [:len $lbbsRouterToken] = 0) do={
  :put "staff45_result=router_env_missing"
} else={
  :onerror diagnosticError in={
    :set stage "fetch"
    :local headers ("Content-Type: application/json,Authorization: Bearer " . $lbbsRouterToken)
    :local result [/tool fetch url=($lbbsApiBaseUrl . "/api/wifi/router/staff/desired") http-method=post http-header-field=$headers http-data="{}" check-certificate=yes output=user as-value]
    :set stage "deserialize"
    :local response [:deserialize from=json options=json.no-string-conversion value=($result->"data")]
    :set stage "mode"
    :if (($response->"mode") != "staff-v41") do={ :error "wrong_mode" }

    :set stage "roster_access"
    :local roster ($response->"devices")
    :if ([:typeof $roster] != "array") do={ :error "invalid_roster_type" }
    :if ([:len $roster] > 150) do={ :error "roster_too_large" }
    :local desiredNames [:toarray ""]

    :foreach entry in=$roster do={
      :set entryNumber ($entryNumber + 1)
      :set stage "entry_extract_username"
      :local username ($entry->"username")
      :set stage "username_type"
      :if ([:typeof $username] != "str") do={ :error "invalid_username_type" }
      :set stage "username_length"
      :if ([:len $username] != 35) do={ :error "invalid_username_length" }
      :set stage "username_prefix"
      :if ([:pick $username 0 3] != "sf_") do={ :error "invalid_username_prefix" }

      :set stage "entry_extract_mac"
      :local mac ($entry->"mac")
      :set stage "mac_type"
      :if ([:typeof $mac] != "str") do={ :error "invalid_mac_type" }
      :set stage "mac_length"
      :if ([:len $mac] != 17) do={ :error "invalid_mac_length" }

      :set stage "entry_extract_password"
      :local secret ($entry->"password")
      :set stage "password_type"
      :if ([:typeof $secret] != "str") do={ :error "invalid_password_type" }
      :set stage "password_length"
      :if ([:len $secret] != 40) do={ :error "invalid_password_length" }

      :set stage "entry_extract_device_id"
      :local deviceId ($entry->"deviceId")
      :set stage "device_id_type"
      :if ([:typeof $deviceId] != "str") do={ :error "invalid_device_id_type" }
      :set stage "device_id_length"
      :if ([:len $deviceId] != 36) do={ :error "invalid_device_id_length" }

      :set stage "entry_extract_credential_id"
      :local credentialId ($entry->"credentialId")
      :set stage "credential_id_type"
      :if ([:typeof $credentialId] != "str") do={ :error "invalid_credential_id_type" }
      :set stage "credential_id_length"
      :if ([:len $credentialId] != 36) do={ :error "invalid_credential_id_length" }

      :set stage "duplicate_find"
      :local foundAt [:find $desiredNames $username]
      :set stage "duplicate_compare"
      :if ([:typeof $foundAt] != "nil") do={ :error "duplicate_username" }
      :set stage "append_desired_names"
      :set desiredNames ($desiredNames, $username)

      :set stage "existing_user_lookup"
      :local anyUser [/ip hotspot user find where name=$username]
      :set stage "staff_user_lookup"
      :local staffUser [/ip hotspot user find where name=$username and server="lbbs-staff-hotspot"]
      :set stage "foreign_username_collision"
      :if ([:len $anyUser] != [:len $staffUser]) do={ :error "username_taken_by_other_hotspot" }
      :set stage "existing_username_count"
      :if ([:len $staffUser] > 1) do={ :error "duplicate_staff_user" }
      :if ([:len $staffUser] = 1) do={
        :set stage "existing_user_tag"
        :local tag [/ip hotspot user get $staffUser comment]
        :if ([:pick $tag 0 10] != "LBBSSTAFF:") do={ :error "unexpected_staff_user_tag" }
      }
    }

    :set stage "ack_readonly"
    :local revision ($response->"revision")
    :local ack [:serialize to=json options=json.no-string-conversion value={"revision"=$revision;"complete"=true}]
    :if ([:len $ack] < 70) do={ :error "ack_invalid" }

    :put "staff45_result=all_readonly_checks_passed"
    :put ("staff45_entries_checked=" . $entryNumber)
    :put "staff45_next=create_or_ack_in_original_sync"
  } do={
    :put ("staff45_failed_stage=" . $stage)
    :put ("staff45_entry_number=" . $entryNumber)
    :put "staff45_result=stopped_without_modifications"
  }
}
