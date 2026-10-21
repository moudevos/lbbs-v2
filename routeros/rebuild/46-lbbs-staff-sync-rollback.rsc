# LBBS46 rollback. Restore original Staff sync v41 ONLY.
# No HotSpot, firewall, Clientes changes or execution.
:local target [/system script find where name="lbbs-staff-sync"]
:local scheduler [/system scheduler find where name="lbbs-staff-sync"]
:if ([:len $target] != 1 || [:len $scheduler] != 1) do={ :error "LBBS46 rollback: Staff scripts missing" }
:if ([/system scheduler get $scheduler disabled] = false) do={ :error "LBBS46 rollback: disable Staff sync scheduler first" }
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

  :do {
    :local fetchResult [/tool fetch url=($lbbsApiBaseUrl . "/api/wifi/router/staff/desired") http-method=post http-header-field=$header http-data="{}" check-certificate=yes output=user as-value]
    :set result [:deserialize from=json options=json.no-string-conversion value=($fetchResult->"data")]
    :if (($result->"mode") != "staff-v41") do={ :error "LBBS41: invalid snapshot mode" }
    :local revision ($result->"revision")
    :local roster ($result->"devices")
    :if ([:typeof $revision] != "str" || [:len $revision] != 64) do={ :error "LBBS41: missing snapshot revision" }
    :if ([:typeof $roster] != "array") do={ :error "LBBS41: invalid snapshot roster" }
    :if ([:len $roster] > 150) do={ :error "LBBS41: roster too large" }

    # Validate entire received roster FIRST: no partial trusted data.
    :local desiredNames [:toarray ""]
    :foreach entry in=$roster do={
      :local username ($entry->"username")
      :local mac ($entry->"mac")
      :local secret ($entry->"password")
      :local deviceId ($entry->"deviceId")
      :local credentialId ($entry->"credentialId")
      :if ([:typeof $username] != "str" || [:pick $username 0 3] != "sf_" || [:len $username] != 35) do={ :error "LBBS41: invalid staff username" }
      :if ([:typeof $mac] != "str" || [:len $mac] != 17) do={ :error "LBBS41: invalid staff MAC" }
      :if ([:typeof $secret] != "str" || [:len $secret] != 40) do={ :error "LBBS41: invalid staff password" }
      :if ([:typeof $deviceId] != "str" || [:len $deviceId] != 36 || [:typeof $credentialId] != "str" || [:len $credentialId] != 36) do={ :error "LBBS41: invalid Staff identity" }
      :if ([:find $desiredNames $username] != nil) do={ :error "LBBS41: duplicate Staff account" }
      :set desiredNames ($desiredNames, $username)
    }

    # Restore/update ONLY Staff-tagged accounts on dedicated Staff server.
    :foreach entry in=$roster do={
      :local username ($entry->"username")
      :local mac ($entry->"mac")
      :local secret ($entry->"password")
      :local tag ($prefix . ($entry->"credentialId") . ":" . ($entry->"deviceId"))
      :local userIds [/ip hotspot user find where name=$username and server=$staffServer]
      :if ([:len $userIds] > 1) do={ :error "LBBS41: duplicate local username" }
      :if ([:len $userIds] = 0) do={
        /ip hotspot user add name=$username password=$secret server=$staffServer profile=$staffProfile mac-address=$mac disabled=no comment=$tag
      } else={
        :local existingTag [/ip hotspot user get $userIds comment]
        :if ([:pick $existingTag 0 [:len $prefix]] != $prefix) do={ :error "LBBS41: foreign Staff user collision" }
        :local previousMac [:toupper [:tostr [/ip hotspot user get $userIds mac-address]]]
        :local oldPassword [/ip hotspot user get $userIds password]
        :if (($previousMac != $mac) || ($oldPassword != $secret) || ([/ip hotspot user get $userIds profile] != $staffProfile)) do={
          /ip hotspot active remove [find where user=$username and server=$staffServer]
          /ip hotspot cookie remove [find where user=$username]
        }
        /ip hotspot user set $userIds password=$secret mac-address=$mac profile=$staffProfile disabled=no comment=$tag
      }
      :local check [/ip hotspot user find where name=$username and server=$staffServer]
      :if ([:len $check] != 1) do={ :error "LBBS41: local staff provision failed" }
      :if ([:toupper [:tostr [/ip hotspot user get $check mac-address]]] != $mac) do={ :error "LBBS41: MAC verification failed" }
      :if ([/ip hotspot user get $check password] != $secret || [/ip hotspot user get $check disabled] = true) do={ :error "LBBS41: local Staff password or account invalid" }
    }

    # Remove obsolete accounts ONLY if owned by LBBS Staff tag and server.
    # Removal also terminates revoked sessions and erases their cookies.
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
    :local ack [:serialize to=json options=json.no-string-conversion value={"revision"=$revision;"complete"=true}]
    /tool fetch url=($lbbsApiBaseUrl . "/api/wifi/router/staff/ack") http-method=post http-header-field=$header http-data=$ack check-certificate=yes output=none
    :set lbbsStaffLastSync ("ok devices=" . [:len $roster])
  } on-error={
    :set lbbsStaffLastSync "failed"
    :log warning "LBBS41: Staff synchronization failed; no successful ACK"
  }
}
:put "LBBS46_ROLLBACK_COMPLETE"
