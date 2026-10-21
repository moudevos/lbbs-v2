# LBBS49 - Staff-only clean reconciliation and one-shot reset.
# RouterOS hEX 7.23.x. No Clientes/bridges/firewall/NAT/DHCP/WAN modifications.
# Downloads authoritative desired roster; updates ONLY LBBSSTAFF accounts.
# Never reads back password/comment with /get. Uses exact indexed find instead.
# Failure leaves Staff HotSpot disabled and scheduler disabled.
:local scr [/system script find where name="lbbs-staff-sync"]
:local sched [/system scheduler find where name="lbbs-staff-sync"]
:local staff [/ip hotspot find where name="lbbs-staff-hotspot"]
:local clients [/ip hotspot find where name="lbbs-hotspot"]
:local gate [/ip firewall filter find where comment="LBBS-GATE staff WAN OFF until captive proven"]
:if ([:len $scr] != 1 || [:len $sched] != 1) do={ :error "LBBS49: Staff sync not installed" }
:if ([:len $staff] != 1 || [:len $clients] != 1 || [:len $gate] != 1) do={ :error "LBBS49: HotSpot isolation missing" }
:if ([/system scheduler get $sched disabled] = false) do={ :error "LBBS49: Staff scheduler must stay disabled" }
:if ([/ip hotspot get $staff disabled] = false || [/ip hotspot get $staff interface] != "bridge-staff") do={ :error "LBBS49: Staff HotSpot not staged" }
:if ([/ip hotspot get $clients disabled] = true || [/ip hotspot get $clients interface] != "bridge-hotspot") do={ :error "LBBS49: Clientes must remain active" }
:if ([/ip firewall filter get $gate disabled] = false) do={ :error "LBBS49: broad Staff WAN gate enabled" }
:if ([:len [/ip hotspot user profile find where name="lbbs-staff-user-profile"]] != 1) do={ :error "LBBS49: missing Staff profile" }
:if ([:len [/system script find where name="lbbs-env"]] != 1) do={ :error "LBBS49: missing env loader" }

/system script set $scr policy=ftp,read,write,policy,test,sensitive source={
  :global lbbsApiBaseUrl
  :global lbbsRouterToken
  :global lbbsStaffLastSync
  :local stage "init"
  :set lbbsStaffLastSync "starting"
  :onerror syncError in={
    :if ([:len $lbbsApiBaseUrl] = 0 || [:len $lbbsRouterToken] = 0) do={ :error "staff_env_missing" }
    :local staffServer "lbbs-staff-hotspot"
    :local staffProfile "lbbs-staff-user-profile"
    :local prefix "LBBSSTAFF:"
    :local headers ("Content-Type: application/json,Authorization: Bearer " . $lbbsRouterToken)

    :set stage "fetch"
    :local downloaded [/tool fetch url=($lbbsApiBaseUrl . "/api/wifi/router/staff/desired") http-method=post http-header-field=$headers http-data="{}" check-certificate=yes output=user as-value]
    :set stage "deserialize"
    :local payload [:deserialize from=json options=json.no-string-conversion value=($downloaded->"data")]
    :if (($payload->"mode") != "staff-v41") do={ :error "wrong_mode" }
    :local revision ($payload->"revision")
    :local devices ($payload->"devices")
    :if ([:typeof $revision] != "str" || [:len $revision] != 64) do={ :error "bad_revision" }
    :if ([:typeof $devices] != "array" || [:len $devices] > 150) do={ :error "bad_roster" }

    # FULL VALIDATION before any write, using RSC45 proven individual checks.
    :set stage "validate"
    :local allowedNames [:toarray ""]
    :foreach item in=$devices do={
      :local username ($item->"username")
      :local mac ($item->"mac")
      :local secret ($item->"password")
      :local deviceId ($item->"deviceId")
      :local credentialId ($item->"credentialId")
      :local tag ($item->"syncTag")
      :if ([:typeof $username] != "str") do={ :error "bad_username_type" }
      :if ([:len $username] != 35 || [:pick $username 0 3] != "sf_") do={ :error "bad_username" }
      :if ([:typeof $mac] != "str") do={ :error "bad_mac_type" }
      :if ([:len $mac] != 17) do={ :error "bad_mac" }
      :if ([:typeof $secret] != "str") do={ :error "bad_secret_type" }
      :if ([:len $secret] != 40) do={ :error "bad_secret" }
      :if ([:typeof $deviceId] != "str" || [:len $deviceId] != 36) do={ :error "bad_device_id" }
      :if ([:typeof $credentialId] != "str" || [:len $credentialId] != 36) do={ :error "bad_credential_id" }
      :if ([:typeof $tag] != "str" || [:len $tag] != 96) do={ :error "bad_sync_tag" }
      :if ([:pick $tag 0 10] != $prefix) do={ :error "wrong_tag_prefix" }
      :if ([:pick $tag 10 46] != $credentialId || [:pick $tag 47 83] != $deviceId) do={ :error "wrong_tag_identity" }
      :local existsAt [:find $allowedNames $username]
      :if ([:typeof $existsAt] != "nil") do={ :error "duplicate_username" }
      :set allowedNames ($allowedNames, $username)
    }

    # A different HotSpot's account can never be taken over by Staff.
    :set stage "preflight_existing"
    :foreach item in=$devices do={
      :local username ($item->"username")
      :local everyone [/ip hotspot user find where name=$username]
      :local owned [/ip hotspot user find where name=$username and server="lbbs-staff-hotspot" and comment~"^LBBSSTAFF:"]
      :if ([:len $everyone] != [:len $owned] || [:len $owned] > 1) do={ :error "foreign_username_collision" }
    }

    # On first run after DB reset, remove obsolete LBBSSTAFF users safely.
    # Account reconciliation is ID/MAC/profile/tag-specific, no sensitive GET.
    :foreach item in=$devices do={
      :local username ($item->"username")
      :local mac ($item->"mac")
      :local secret ($item->"password")
      :local tag ($item->"syncTag")
      :set stage "lookup_user"
      :local owned [/ip hotspot user find where name=$username and server="lbbs-staff-hotspot" and comment~"^LBBSSTAFF:"]
      :local exact [/ip hotspot user find where name=$username and server="lbbs-staff-hotspot" and comment=$tag and mac-address=$mac and profile=$staffProfile and disabled=no]
      :if ([:len $owned] = 1 && [:len $exact] != 1) do={
        :set stage "replace_changed_user"
        /ip hotspot active remove [find where server=$staffServer and user=$username]
        /ip hotspot cookie remove [find where user=$username]
        /ip hotspot user remove $owned
      }
      :if ([:len $exact] != 1) do={
        :set stage "create_user"
        /ip hotspot user add name=$username server=$staffServer profile=$staffProfile mac-address=$mac disabled=no comment=$tag password=$secret
      }
      :set stage "verify_user"
      :local verified [/ip hotspot user find where name=$username and server=$staffServer and comment=$tag and mac-address=$mac and profile=$staffProfile and disabled=no]
      :if ([:len $verified] != 1) do={ :error "staff_user_not_verified" }
    }

    :set stage "purge_revoked"
    :foreach id in=[/ip hotspot user find where server=$staffServer and comment~"^LBBSSTAFF:"] do={
      :local name [/ip hotspot user get $id name]
      :local member [:find $allowedNames $name]
      :if ([:typeof $member] = "nil") do={
        /ip hotspot active remove [find where server=$staffServer and user=$name]
        /ip hotspot cookie remove [find where user=$name]
        /ip hotspot user remove $id
      }
    }
    :set stage "verify_roster"
    :local countManaged [:len [/ip hotspot user find where server=$staffServer and comment~"^LBBSSTAFF:"]]
    :if ($countManaged != [:len $devices]) do={ :error "staff_roster_count_mismatch" }

    :set stage "ack"
    :local ack [:serialize to=json options=json.no-string-conversion value={"revision"=$revision;"complete"=true}]
    /tool fetch url=($lbbsApiBaseUrl . "/api/wifi/router/staff/ack") http-method=post http-header-field=$headers http-data=$ack check-certificate=yes output=none
    :set lbbsStaffLastSync ("ok devices=" . [:len $devices])
  } do={
    :set lbbsStaffLastSync ("failed stage=" . $stage)
    :log warning ("LBBS49: Staff sync failed at " . $stage)
  }
}

# One-shot reconcile (does not enable Staff HotSpot, WAN or scheduler).
/system script run lbbs-env
/system script run lbbs-staff-sync
:global lbbsStaffLastSync
:put ("LBBS49_SYNC=" . $lbbsStaffLastSync)
:put ("LBBS49_STAFF_USERS=" . [:len [/ip hotspot user find where server="lbbs-staff-hotspot"]])
:put ("LBBS49_STAFF_HOTSPOT_DISABLED=" . [/ip hotspot get $staff disabled])
:put ("LBBS49_CLIENTES_DISABLED=" . [/ip hotspot get $clients disabled])
:put ("LBBS49_SCHEDULER_DISABLED=" . [/system scheduler get $sched disabled])
