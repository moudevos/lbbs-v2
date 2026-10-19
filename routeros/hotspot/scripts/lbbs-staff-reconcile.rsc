# WiFi Staff: reconciliation safety guard (RouterOS 7).
# STAGED ONLY. Do not install until the dedicated Staff HotSpot exists.
# Never touches customer vouchers or customer HotSpot users.
# Prerequisites: lbbsApiBaseUrl, lbbsRouterToken persisted securely.
# Staff accounts must be tagged with comment "LBBSSTAFF:<credential-uuid>".
# This guard only revokes unauthorized accounts; it never grants access.
/system script remove [find where name="lbbs-staff-reconcile"]
/system script add name="lbbs-staff-reconcile" policy=ftp,read,write,policy,test,sensitive source={
  :global lbbsApiBaseUrl
  :global lbbsRouterToken
  :if ([:len $lbbsApiBaseUrl] = 0 || [:len $lbbsRouterToken] = 0) do={
    :log warning "LBBS Staff: missing API configuration"
    :error "staff_not_configured"
  }
  :local headers ("Content-Type: application/json,Authorization: Bearer " . $lbbsRouterToken)
  :do {
    :local result [/tool fetch url=($lbbsApiBaseUrl . "/api/wifi/router/staff/desired") http-method=post http-header-field=$headers http-data="{}" check-certificate=yes output=user as-value]
    :local snapshot [:deserialize from=json options=json.no-string-conversion value=($result->"data")]
    :if (($snapshot->"mode") != "read-only") do={ :error "invalid_staff_snapshot" }
    :local authorized ($snapshot->"devices")
    :foreach userId in=[/ip hotspot user find] do={
      :local tag [/ip hotspot user get $userId comment]
      :if ([:find $tag "LBBSSTAFF:"] = 0) do={
        :local allowed false
        :local username [/ip hotspot user get $userId name]
        :local boundMac [:toupper [/ip hotspot user get $userId mac-address]]
        :local credentialId [:pick $tag 10 [:len $tag]]
        :foreach device in=$authorized do={
          :if (($device->"credentialId") = $credentialId && [:toupper ($device->"mac")] = $boundMac) do={
            :set allowed true
          }
        }
        :if (!$allowed) do={
          /ip hotspot active remove [find where user=$username]
          /ip hotspot user disable $userId
          :log info "LBBS Staff: unauthorized device disconnected"
        }
      }
    }
  } on-error={
    # Fail closed for new access elsewhere; never act on partial/failed snapshots.
    :log warning "LBBS Staff: reconciliation failed, no changes applied"
  }
}
