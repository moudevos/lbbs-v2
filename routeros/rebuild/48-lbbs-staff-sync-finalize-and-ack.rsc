# LBBS48 Staff sync: separate safe verification and ACK.
# Single import performs preflight, patches ONLY existing lbbs-staff-sync script,
# runs ONE manual Staff-only sync, prints SANITIZED state and user count.
# No changes to Clientes, bridge, DHCP, firewall, WAN, Staff schedulers or HotSpot state.
# RSC46 rollback (existing on GitHub) restores original Staff script if necessary.
:local target [/system script find where name="lbbs-staff-sync"]
:if ([:len $target] != 1) do={ :error "LBBS47: Staff sync missing/duplicated" }
:local scheduler [/system scheduler find where name="lbbs-staff-sync"]
:if ([:len $scheduler] != 1) do={ :error "LBBS47: Staff scheduler missing" }
:if ([/system scheduler get $scheduler disabled] = false) do={ :error "LBBS47: Staff scheduler must remain DISABLED" }
:local staffServer [/ip hotspot find where name="lbbs-staff-hotspot"]
:if ([:len $staffServer] != 1) do={ :error "LBBS47: Staff HotSpot missing" }
:if (([/ip hotspot get $staffServer interface] != "bridge-staff") || ([/ip hotspot get $staffServer disabled] = false)) do={ :error "LBBS47: Staff HotSpot must remain DISABLED on bridge-staff" }
:local clientsServer [/ip hotspot find where name="lbbs-hotspot"]
:if ([:len $clientsServer] != 1) do={ :error "LBBS47: Clients HotSpot missing" }
:if (([/ip hotspot get $clientsServer interface] != "bridge-hotspot") || ([/ip hotspot get $clientsServer disabled] = true)) do={ :error "LBBS47: Clientes HotSpot must remain operational" }
:local gate [/ip firewall filter find where comment="LBBS-GATE staff WAN OFF until captive proven"]
:if ([:len $gate] != 1) do={ :error "LBBS47: Staff WAN gate missing" }
:if ([/ip firewall filter get $gate disabled] = false) do={ :error "LBBS47: broad Staff WAN gate must remain DISABLED" }
:if ([:len [/ip hotspot user profile find where name="lbbs-staff-user-profile"]] != 1) do={ :error "LBBS47: Staff profile missing" }
:if ([:len [/system script find where name="lbbs-env"]] != 1) do={ :error "LBBS47: router env loader missing" }

# Apply only the source change. Original on-login/on-logout hooks stay intact.

/system script set $target policy=ftp,read,write,policy,test,sensitive source={

  :global lbbsApiBaseUrl
  :global lbbsRouterToken
  :global lbbsStaffLastSync

  :if ([:len $lbbsApiBaseUrl] = 0 || [:len $lbbsRouterToken] = 0) do={
    :log warning "LBBS41: missing secure router configuration"
    :error "lbbs_staff_not_configured"
  }
  :local header ("Content-Type: application/json,Authorization: Bearer " . $lbbsRouterToken)
  :local staffServer "lbbs-staff-hotspot"
  :local staffProfile "lbbs-staff-user-profile"
  :local prefix "LBBSSTAFF:"
  :local result
  :local stage "init"

  :onerror syncFailure in={
    :set stage "fetch_desired"
    :local fetchResult [/tool fetch url=($lbbsApiBaseUrl . "/api/wifi/router/staff/desired") http-method=post http-header-field=$header http-data="{}" check-certificate=yes output=user as-value]
    :set stage "decode_desired"
    :set result [:deserialize from=json options=json.no-string-conversion value=($fetchResult->"data")]
    :set stage "mode_check"
    :if (($result->"mode") != "staff-v41") do={ :error "LBBS41: invalid snapshot mode" }
    :set stage "revision_read"
    :local revision ($result->"revision")
    :local roster ($result->"devices")
    :set stage "revision_validate"
    :if ([:typeof $revision] != "str" || [:len $revision] != 64) do={ :error "LBBS41: missing snapshot revision" }
    :set stage "roster_validate"
    :if ([:typeof $roster] != "array") do={ :error "LBBS41: invalid snapshot roster" }
    :if ([:len $roster] > 150) do={ :error "LBBS41: roster too large" }

    # Validate entire received roster FIRST: no partial trusted data.
    :set stage "validate_all_entries"
    :local desiredNames [:toarray ""]
    :foreach entry in=$roster do={
      :set stage "entry_read"
      :local username ($entry->"username")
      :local mac ($entry->"mac")
      :local secret ($entry->"password")
      :local deviceId ($entry->"deviceId")
      :local credentialId ($entry->"credentialId")
      # RouterOS nil is a TYPE, not a comparison literal.
      # This mirrors the individually validated RSC45 checks.
      :set stage "username_type"
      :if ([:typeof $username] != "str") do={ :error "LBBS47: invalid username type" }
      :set stage "username_length"
      :if ([:len $username] != 35) do={ :error "LBBS47: invalid username length" }
      :set stage "username_prefix"
      :if ([:pick $username 0 3] != "sf_") do={ :error "LBBS47: invalid username prefix" }
      :set stage "mac_type"
      :if ([:typeof $mac] != "str") do={ :error "LBBS47: invalid mac type" }
      :set stage "mac_length"
      :if ([:len $mac] != 17) do={ :error "LBBS47: invalid mac length" }
      :set stage "password_type"
      :if ([:typeof $secret] != "str") do={ :error "LBBS47: invalid password type" }
      :set stage "password_length"
      :if ([:len $secret] != 40) do={ :error "LBBS47: invalid password length" }
      :set stage "device_id_type"
      :if ([:typeof $deviceId] != "str") do={ :error "LBBS47: invalid device id type" }
      :set stage "device_id_length"
      :if ([:len $deviceId] != 36) do={ :error "LBBS47: invalid device id length" }
      :set stage "credential_id_type"
      :if ([:typeof $credentialId] != "str") do={ :error "LBBS47: invalid credential id type" }
      :set stage "credential_id_length"
      :if ([:len $credentialId] != 36) do={ :error "LBBS47: invalid credential id length" }
      :set stage "duplicate_lookup"
      :local duplicateAt [:find $desiredNames $username]
      :set stage "duplicate_check"
      :if ([:typeof $duplicateAt] != "nil") do={ :error "LBBS47: duplicate Staff account" }
      :set stage "desired_name_append"
      :set desiredNames ($desiredNames, $username)
    }

    :set stage "entries_validated"
    :set stage "revision_marker"
    :local revisionMarker ("sync-" . $revision . "@lbbs.invalid")
    # Restore/update ONLY Staff-tagged accounts on dedicated Staff server.
    :foreach entry in=$roster do={
      :local username ($entry->"username")
      :local mac ($entry->"mac")
      :local secret ($entry->"password")
      :local tag ($prefix . ($entry->"credentialId") . ":" . ($entry->"deviceId"))
      :set stage "find_staff_user"
      :local userIds [/ip hotspot user find where name=$username and server=$staffServer]
      :if ([:len $userIds] > 1) do={ :error "LBBS41: duplicate local username" }
      :set stage "foreign_collision_check"
      :local anyUserIds [/ip hotspot user find where name=$username]
      :if ([:len $anyUserIds] != [:len $userIds]) do={ :error "LBBS47: username collision outside Staff" }
      :if ([:len $userIds] = 0) do={
        :set stage "create_staff_user"
        /ip hotspot user add name=$username password=$secret server=$staffServer profile=$staffProfile mac-address=$mac disabled=no comment=$tag email=$revisionMarker
      } else={
        :set stage "inspect_staff_user"
        :local existingTag [/ip hotspot user get $userIds comment]
        :if ([:pick $existingTag 0 [:len $prefix]] != $prefix) do={ :error "LBBS41: foreign Staff user collision" }
        :local previousMac [:toupper [:tostr [/ip hotspot user get $userIds mac-address]]]
        :local previousMarker [/ip hotspot user get $userIds email]
        :if (($previousMac != $mac) || ($previousMarker != $revisionMarker) || ([/ip hotspot user get $userIds profile] != $staffProfile)) do={
          /ip hotspot active remove [find where user=$username and server=$staffServer]
          /ip hotspot cookie remove [find where user=$username]
        }
        :set stage "update_staff_user"
        /ip hotspot user set $userIds password=$secret mac-address=$mac profile=$staffProfile disabled=no comment=$tag email=$revisionMarker
      }
      :set stage "verify_exists"
      :local check [/ip hotspot user find where name=$username and server=$staffServer]
      :if ([:len $check] != 1) do={ :error "LBBS48: missing Staff user" }
      :set stage "verify_mac"
      :local actualMac [:toupper [:tostr [/ip hotspot user get $check mac-address]]]
      :if ($actualMac != $mac) do={ :error "LBBS48: MAC mismatch" }
      :set stage "verify_profile"
      :if ([/ip hotspot user get $check profile] != $staffProfile) do={ :error "LBBS48: profile mismatch" }
      :set stage "verify_disabled"
      :if ([/ip hotspot user get $check disabled] = true) do={ :error "LBBS48: account disabled" }
      :set stage "verify_comment"
      :if ([/ip hotspot user get $check comment] != $tag) do={ :error "LBBS48: tag mismatch" }
      :set stage "verify_revision"
      :if ([/ip hotspot user get $check email] != $revisionMarker) do={ :error "LBBS48: revision mismatch" }
    }

    # Remove obsolete accounts ONLY if owned by LBBS Staff tag and server.
    # Removal also terminates revoked sessions and erases their cookies.
    :set stage "revoke_obsolete_users"
    :foreach uid in=[/ip hotspot user find where server=$staffServer] do={
      :local tag [/ip hotspot user get $uid comment]
      :if ([:pick $tag 0 [:len $prefix]] = $prefix) do={
        :local username [/ip hotspot user get $uid name]
        :local allowed false
        :foreach allowedName in=$desiredNames do={
          :if ($allowedName = $username) do={ :set allowed true }
        }
        :if (!$allowed) do={
          /ip hotspot active remove [find where user=$username and server=$staffServer]
          /ip hotspot cookie remove [find where user=$username]
          /ip hotspot user remove $uid
        }
      }
    }

    # ACK only after the entire roster is locally applied.
    :set stage "serialize_ack"
    :local ack [:serialize to=json options=json.no-string-conversion value={"revision"=$revision;"complete"=true}]
    :set stage "send_ack"
    /tool fetch url=($lbbsApiBaseUrl . "/api/wifi/router/staff/ack") http-method=post http-header-field=$header http-data=$ack check-certificate=yes output=none
    :set stage "complete"
    :set lbbsStaffLastSync ("ok devices=" . [:len $roster])
  } do={
    :set lbbsStaffLastSync ("failed stage=" . $stage)
    :log warning ("LBBS48: Staff sync failed at " . $stage . "; no successful ACK")
  }

}

# One controlled test (also loads environment); no scheduler is enabled.
/system script run lbbs-env
:global lbbsStaffLastSync
:set lbbsStaffLastSync "not_started"
/system script run lbbs-staff-sync
:put ("LBBS48_RESULT=" . $lbbsStaffLastSync)
:put ("LBBS48_STAFF_USERS=" . [:len [/ip hotspot user find where server="lbbs-staff-hotspot"]])
:put ("LBBS48_STAFF_HOTSPOT_DISABLED=" . [/ip hotspot get $staffServer disabled])
:put ("LBBS48_CLIENTES_DISABLED=" . [/ip hotspot get $clientsServer disabled])
:put ("LBBS48_SCHEDULER_DISABLED=" . [/system scheduler get $scheduler disabled])
