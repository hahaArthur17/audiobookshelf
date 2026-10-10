function CK {
  param([switch]$Mark)
  $dest = "D:\SEM-2\574\po-s06-run\audiobookshelf"
  $ev = "D:\SEM-2\574\Project\audiobookshelf-po\evidence\test-results\PO-S06"
  $startFile = "$ev\run-start.txt"
  $logFile = "$ev\run-log.txt"
  $names = "server/objects/Notification","server/objects/Task","server/objects/TrackProgressMonitor","server/objects/files/AudioTrack","server/objects/metadata/AudioMetaTags","server/providers/OpenLibrary","server/utils/areEquivalent","server/utils/generators/hlsPlaylistGenerator","server/utils/globals","server/utils/longTimeout","server/utils/parsers/parseFullName","server/utils/parsers/parseNfoMetadata","server/utils/parsers/parseUserAgent","server/utils/stringifySequelizeQuery"
  if ($Mark) {
    $t = Get-Date
    Set-Content -Path $startFile -Value $t.ToString("yyyy-MM-dd HH:mm:ss")
    Add-Content -Path $logFile -Value ("[" + $t.ToString("HH:mm:ss") + "] START: prompt sent (marked within a few seconds of pressing Enter)")
    Write-Host ("Start marked at " + $t.ToString("HH:mm:ss"))
    return
  }
  $now = Get-Date
  $mins = "unknown (no start mark)"
  if (Test-Path $startFile) {
    $s = [datetime]::ParseExact((Get-Content $startFile).Trim(), "yyyy-MM-dd HH:mm:ss", $null)
    $mins = [int][math]::Floor(($now - $s).TotalMinutes)
  }
  $commits = @(git --no-optional-locks -C $dest log --format="%h %ad %s" --date=format:%H:%M:%S)
  $base = (git --no-optional-locks -C $dest rev-list --max-parents=0 HEAD)
  $ts = @(Get-ChildItem "$dest\server" -Recurse -File -Filter *.ts | Where-Object { $_.Name -notlike "*.d.ts" }).Count
  $js = @(Get-ChildItem "$dest\server" -Recurse -File -Filter *.js).Count
  $conv = 0
  foreach ($n in $names) { if (Test-Path ("$dest\" + ($n -replace '/', '\') + ".ts")) { $conv++ } }
  $dirty = @(git --no-optional-locks -C $dest status --short).Count
  $prot = @(git --no-optional-locks -C $dest diff --name-only $base -- test tsconfig.server.json package.json package-lock.json server/libs).Count
  $sh = (Get-FileHash "$dest\.claude\settings.local.json" -Algorithm SHA1).Hash.Substring(0, 8)
  $out = @()
  $out += ("[" + $now.ToString("HH:mm:ss") + "] CHECKPOINT at " + $mins + " minutes")
  $out += ("  commits (the baseline counts as 1): " + $commits.Count + " ; last: " + ($commits | Select-Object -First 1))
  $out += ("  server .ts files (without .d.ts): $ts ; .js files: $js ; of the 14 files, now .ts: $conv")
  $out += ("  changed files not yet committed: $dirty ; protected paths changed against the baseline: $prot ; settings hash: $sh")
  if (($mins -is [int]) -and ($mins -ge 90)) { $out += "  STOP RULE: 90 minutes reached. Press Esc in the Claude Code window and note that we stopped the run." }
  $out | Add-Content -Path $logFile
  $out | ForEach-Object { Write-Host $_ }
}