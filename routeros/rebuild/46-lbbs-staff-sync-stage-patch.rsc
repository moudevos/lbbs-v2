# LBBS46 Staff synchronization stage patch for hEX RouterOS 7.23.8.
# REPLACES ONLY source of existing Staff script lbbs-staff-sync.
# Does not run the script, create hotspot users or change Clientes.
# Keeps staff scheduler and Staff HotSpot disabled.
# A failed manual run will record "failed stage=<stage>" without secrets.
# Restore original v41 with 46-lbbs-staff-sync-rollback.rsc if necessary.
:local target [/system script find where name="lbbs-staff-sync"]
:if ([:len $target] != 1) do={ :error "LBBS46: original Staff sync missing or duplicated" }
:local scheduler [/system scheduler find where name="lbbs-staff-sync"]
:if ([:len $scheduler] != 1) do={ :error "LBBS46: Staff scheduler missing" }
:if ([/system scheduler get $scheduler disabled] = false) do={ :error "LBBS46: disable Staff sync scheduler first" }
:local staffServer [/ip hotspot find where name="lbbs-staff-hotspot"]
:if ([:len $staffServer] != 1) do={ :error "LBBS46: Staff HotSpot missing" }
:if (([/ip hotspot get $staffServer interface] != "bridge-staff") || ([/ip hotspot get $staffServer disabled] = false)) do={ :error "LBBS46: Staff HotSpot must remain disabled" }
:local clientsServer [/ip hotspot find where name="lbbs-hotspot"]
:if ([:len $clientsServer] != 1) do={ :error "LBBS46: Clientes HotSpot missing" }
:if ([/ip hotspot get $clientsServer disabled] = true) do={ :error "LBBS46: Clientes not healthy" }
:local gate [/ip firewall filter find where comment="LBBS-GATE staff WAN OFF until captive proven"]
:if ([:len $gate] != 1) do={ :error "LBBS46: Staff WAN gate missing" }
:if ([/ip firewall filter get $gate disabled] = false) do={ :error "LBBS46: Staff WAN broad gate must stay disabled" }
:if ([:len [/ip hotspot user profile find where name="lbbs-staff-user-profile"]] != 1) do={ :error "LBBS46: Staff user profile missing" }

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
      :set stage "entry_validate"
      :if ([:typeof $username] != "str" || [:pick $username 0 3] != "sf_" || [:len $username] != 35) do={ :error "LBBS41: invalid staff username" }
      :if ([:typeof $mac] != "str" || [:len $mac] != 17) do={ :error "LBBS41: invalid staff MAC" }
      :if ([:typeof $secret] != "str" || [:len $secret] != 40) do={ :error "LBBS41: invalid staff password" }
      :if ([:typeof $deviceId] != "str" || [:len $deviceId] != 36 || [:typeof $credentialId] != "str" || [:len $credentialId] != 36) do={ :error "LBBS41: invalid Staff identity" }
      :if ([:find $desiredNames $username] != nil) do={ :error "LBBS41: duplicate Staff account" }
      :set desiredNames ($desiredNames, $username)
    }

    :set stage "entries_validated"
    # Restore/update ONLY Staff-tagged accounts on dedicated Staff server.
    :foreach entry in=$roster do={
      :local username ($entry->"username")
      :local mac ($entry->"mac")
      :local secret ($entry->"password")
      :local tag ($prefix . ($entry->"credentialId") . ":" . ($entry->"deviceId"))
      :set stage "find_staff_user"
      :local userIds [/ip hotspot user find where name=$username and server=$staffServer]
      :if ([:len $userIds] > 1) do={ :error "LBBS41: duplicate local username" }
      :if ([:len $userIds] = 0) do={
        :set stage "create_staff_user"
        /ip hotspot user add name=$username password=$secret server=$staffServer profile=$staffProfile mac-address=$mac disabled=no comment=$tag
      } else={
        :set stage "inspect_staff_user"
        :local existingTag [/ip hotspot user get $userIds comment]
        :if ([:pick $existingTag 0 [:len $prefix]] != $prefix) do={ :error "LBBS41: foreign Staff user collision" }
        :local previousMac [:toupper [:tostr [/ip hotspot user get $userIds mac-address]]]
        :local oldPassword [/ip hotspot user get $userIds password]
        :if (($previousMac != $mac) || ($oldPassword != $secret) || ([/ip hotspot user get $userIds profile] != $staffProfile)) do={
          /ip hotspot active remove [find where user=$username and server=$staffServer]
          /ip hotspot cookie remove [find where user=$username]
        }
        :set stage "update_staff_user"
        /ip hotspot user set $userIds password=$secret mac-address=$mac profile=$staffProfile disabled=no comment=$tag
      }
      :set stage "verify_staff_user"
      :local check [/ip hotspot user find where name=$username and server=$staffServer]
      :if ([:len $check] != 1) do={ :error "LBBS41: local staff provision failed" }
      :if ([:toupper [:tostr [/ip hotspot user get $check mac-address]]] != $mac) do={ :error "LBBS41: MAC verification failed" }
      :if ([/ip hotspot user get $check password] != $secret || [/ip hotspot user get $check disabled] = true) do={ :error "LBBS41: local Staff password or account invalid" }
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
    :log warning ("LBBS46: Staff sync failed at " . $stage . "; no successful ACK")
  }

}
:put "LBBS46_PATCH_INSTALLED_STAGED"
:put "LBBS46_STAFF_SCHEDULER_DISABLED"
:put "LBBS46_NOW_RUN_MANUAL_SYNC_ONCE"
