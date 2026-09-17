# Verify the Cloudflare zone for knowsia.com BEFORE the registrar switch.
#
# Cloudflare's nameservers answer for a zone as soon as it exists there, even
# though the domain is still delegated elsewhere. So every record can be checked
# in advance by querying Cloudflare directly and comparing against what the
# world currently sees. Nothing here changes anything.
#
# WHY THIS EXISTS: Cloudflare's onboarding scan omitted reg.knowsia.com on
# 2026-09-12 -- live, serving 200, and the host of the registration app, the
# four portals and the 312 printed /verify/KNS-... URLs. Switching nameservers
# on the scanned set would have taken all of it down. Trust neither the scan
# nor the import; verify.
#
#   powershell -ExecutionPolicy Bypass -File scripts\dns\verify-cloudflare-zone.ps1

$CF   = 'ernest.ns.cloudflare.com'     # Cloudflare's nameserver for this zone
$LIVE = '8.8.8.8'                      # what the world sees today

# name, type, and whether its absence is an OUTAGE rather than a nuisance
$expected = @(
    @{ n = 'knowsia.com';                      t = 'A';     critical = $true  },
    @{ n = 'www.knowsia.com';                  t = 'CNAME'; critical = $true  },
    @{ n = 'reg.knowsia.com';                  t = 'CNAME'; critical = $true  },
    @{ n = 'knowsia.com';                      t = 'MX';    critical = $true  },
    @{ n = 'mail.knowsia.com';                 t = 'A';     critical = $true  },
    @{ n = 'knowsia.com';                      t = 'TXT';   critical = $true  },
    @{ n = '_dmarc.knowsia.com';               t = 'TXT';   critical = $false },
    @{ n = 'default._domainkey.knowsia.com';   t = 'TXT';   critical = $false },
    @{ n = 'send.knowsia.com';                 t = 'TXT';   critical = $false },
    @{ n = 'send.knowsia.com';                 t = 'MX';    critical = $false },
    @{ n = 'resend._domainkey.knowsia.com';    t = 'TXT';   critical = $false },
    @{ n = 'link.knowsia.com';                 t = 'CNAME'; critical = $false },
    @{ n = 'quiz.knowsia.com';                 t = 'CNAME'; critical = $false },
    @{ n = 'quiz.knowsia.com';                 t = 'TXT';   critical = $false },
    @{ n = '_acme-challenge.quiz.knowsia.com'; t = 'TXT';   critical = $false },
    @{ n = 'ftp.knowsia.com';                  t = 'CNAME'; critical = $false }
)

function Get-Values($name, $type, $server) {
    try {
        $r = Resolve-DnsName -Name $name -Type $type -Server $server -ErrorAction Stop
        $v = @()
        foreach ($x in $r) {
            if ($x.Strings)          { $v += ($x.Strings -join '') }
            elseif ($x.NameExchange) { $v += "$($x.NameExchange) pri=$($x.Preference)" }
            elseif ($x.IPAddress)    { $v += $x.IPAddress }
            elseif ($x.NameHost)     { $v += $x.NameHost }
        }
        return , (@($v) | Sort-Object)
    } catch { return , @() }
}

$missing = 0
$criticalMissing = 0
"{0,-42} {1,-6} {2}" -f 'NAME', 'TYPE', 'CLOUDFLARE'
"-" * 100

foreach ($e in $expected) {
    $cf = Get-Values $e.n $e.t $CF
    if ($cf.Count -eq 0) {
        $missing++
        if ($e.critical) { $criticalMissing++; $tag = 'MISSING - OUTAGE' } else { $tag = 'missing' }
        "{0,-42} {1,-6} {2}" -f $e.n, $e.t, $tag
    } else {
        $shown = ($cf -join ' | ')
        if ($shown.Length -gt 48) { $shown = $shown.Substring(0, 45) + '...' }
        "{0,-42} {1,-6} ok   {2}" -f $e.n, $e.t, $shown
    }
}

"`n--- comparison with what the world currently resolves ---"
foreach ($e in $expected) {
    $cf   = Get-Values $e.n $e.t $CF
    $live = Get-Values $e.n $e.t $LIVE
    if ($live.Count -eq 0) { continue }      # live can't answer TXT; nothing to compare
    $same = (($cf -join '|') -eq ($live -join '|'))
    if (-not $same) {
        "DIFFERS  {0} {1}" -f $e.n, $e.t
        "   cloudflare: $($cf -join ' | ')"
        "   live      : $($live -join ' | ')"
    }
}

"`n=== $missing missing, of which $criticalMissing would cause an outage ==="
if ($criticalMissing -gt 0) {
    "DO NOT switch nameservers. Add the records marked OUTAGE first."
} elseif ($missing -gt 0) {
    "Safe to switch: the gaps are nuisances, not outages. Fix them after."
} else {
    "Zone is complete. Safe to switch nameservers."
}
