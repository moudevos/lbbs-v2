# LBBS41 Staff RouterOS 7.23.8 - INSTALL ONLY, scheduler DISABLED.
# Requires LBBS40 previously installed (Staff HotSpot still disabled).
# Uses existing lbbs-env and router bearer credential. NEVER displays tokens.
# Does not change bridge-hotspot/Clientes, client scripts or their sync.
# No WAN allow rule, no staff HotSpot enable in this installer.

:local srv [/ip hotspot find where name="lbbs-staff-hotspot"]
:if ([:len $srv] != 1) do={ :error "LBBS41: Staff server missing" }
:if (([/ip hotspot get $srv disabled] = false) || ([/ip hotspot get $srv interface] != "bridge-staff")) do={ :error "LBBS41: Staff server must be staged disabled" }
:if ([:len [/ip hotspot user profile find where name="lbbs-staff-user-profile"]] != 1) do={ :error "LBBS41: Staff user profile missing" }
:if ([:len [/system script find where name="lbbs-env"]] != 1) do={ :error "LBBS41: secure router env missing" }
:if ([:len [/system script find where name="lbbs-staff-sync"]] > 0 || [:len [/system scheduler find where name="lbbs-staff-sync"]] > 0) do={ :error "LBBS41: already installed" }
:if ([:len [/ip firewall filter find where comment="LBBS-GATE staff WAN OFF until captive proven"]] != 1) do={ :error "LBBS41: broad Staff gate missing" }
:local gate [/ip firewall filter find where comment="LBBS-GATE staff WAN OFF until captive proven"]
:if ([/ip firewall filter get $gate disabled] = false) do={ :error "LBBS41: broad WAN gate must stay disabled" }

# Dedicated service. A missing/invalid full snapshot means NO changes and NO ACK.
/system script add name="lbbs-staff-sync" policy=ftp,read,write,policy,test,sensitive source={
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

# This scheduler remains disabled until backend and preauth firewall are ready.
# Explicit lbbs-env reload survives router restart.
/system scheduler add name="lbbs-staff-sync" interval=20s disabled=yes policy=ftp,read,write,policy,test,sensitive on-event="/system script run lbbs-env; /system script run lbbs-staff-sync" comment="LBBS41 Staff-only sync; disabled until authorized pilot"


# RouterOS authenticates only one of the provisioned MAC-bound users.
# Hooks log real Staff sessions through the existing router Bearer token.
# They never modify Clientes and never reject internet if telemetry is down.
:local staffProfile [/ip hotspot user profile find where name="lbbs-staff-user-profile"]
:if ([:len $staffProfile] != 1) do={ :error "LBBS41: Staff profile disappeared" }
/ip hotspot user profile set $staffProfile on-login={
  :global lbbsApiBaseUrl
  :global lbbsRouterToken
  :local username $user
  :local currentMac [:toupper $"mac-address"]
  :local users [/ip hotspot user find where name=$username and server="lbbs-staff-hotspot"]
  :if ([:len $users] = 1 && [:len $lbbsApiBaseUrl] > 0 && [:len $lbbsRouterToken] > 0) do={
    :local tag [/ip hotspot user get $users comment]
    :if ([:pick $tag 0 10] = "LBBSSTAFF:" && [:len $tag] = 83) do={
      :local credentialId [:pick $tag 10 46]
      :local deviceId [:pick $tag 47 83]
      :local key ($username . ":" . $currentMac . ":" . [/system clock get date] . ":" . [/system clock get time])
      :local data [:serialize to=json options=json.no-string-conversion value={"event"="LOGIN";"credentialId"=$credentialId;"deviceId"=$deviceId;"mac"=$currentMac;"sessionKey"=$key}]
      :do {
        /tool fetch url=($lbbsApiBaseUrl . "/api/wifi/router/staff/session") http-method=post http-header-field=("Content-Type: application/json,Authorization: Bearer " . $lbbsRouterToken) http-data=$data check-certificate=yes output=none
      } on-error={
        :log warning "LBBS41: Staff LOGIN telemetry unavailable"
      }
    }
  }
}
/ip hotspot user profile set $staffProfile on-logout={
  :global lbbsApiBaseUrl
  :global lbbsRouterToken
  :local username $user
  :local currentMac [:toupper $"mac-address"]
  :local users [/ip hotspot user find where name=$username and server="lbbs-staff-hotspot"]
  :if ([:len $users] = 1 && [:len $lbbsApiBaseUrl] > 0 && [:len $lbbsRouterToken] > 0) do={
    :local tag [/ip hotspot user get $users comment]
    :if ([:pick $tag 0 10] = "LBBSSTAFF:" && [:len $tag] = 83) do={
      :local credentialId [:pick $tag 10 46]
      :local deviceId [:pick $tag 47 83]
      :local data [:serialize to=json options=json.no-string-conversion value={"event"="LOGOUT";"credentialId"=$credentialId;"deviceId"=$deviceId;"mac"=$currentMac}]
      :do {
        /tool fetch url=($lbbsApiBaseUrl . "/api/wifi/router/staff/session") http-method=post http-header-field=("Content-Type: application/json,Authorization: Bearer " . $lbbsRouterToken) http-data=$data check-certificate=yes output=none
      } on-error={
        :log warning "LBBS41: Staff LOGOUT telemetry unavailable"
      }
    }
  }
}

:log info "LBBS41 STAGED: Staff sync installed DISABLED, no Staff internet, Clientes untouched"
