$S10Repo = 'D:\SEM-2\574\Project\audiobookshelf-po'
$S10Hold = 'D:\SEM-2\574\Project\po-s10-hold'
$S10Base = 'D:\SEM-2\574\Project\po-s10-baseline'

function Get-S10Memory {
    $proj = Get-ChildItem "$env:USERPROFILE\.claude\projects" -Directory | Where-Object { $_.Name -like '*audiobookshelf-po*' } | Select-Object -First 1
    $mem = Join-Path $proj.FullName 'memory'
    if (Test-Path $mem) { return @(Get-ChildItem $mem -File -ErrorAction SilentlyContinue).Count }
    return 0
}

function Prep-S10 {
    Set-Location $S10Repo
    $out = @()
    $out += 'PO-S10 preflight (run by the user with Prep-S10)'
    $out += ('date: ' + (Get-Date -Format 'yyyy-MM-dd HH:mm'))
    $out += ('branch: ' + (git branch --show-current))
    $out += ('HEAD before layout commit: ' + (git log --oneline -1))
    $dirty = @(git status --short | Where-Object { $_ -notmatch '\.claude/' })
    if ($dirty.Count -gt 0) { Write-Host 'The working tree is not clean. Stop and paste this:'; $dirty; return }
    if (-not (Test-Path "$S10Hold\evidence-parked")) { Copy-Item "$S10Repo\evidence" "$S10Hold\evidence-parked" -Recurse }
    $out += ('evidence files parked: ' + (Get-ChildItem "$S10Hold\evidence-parked" -Recurse -File).Count)
    git rm -r -q evidence
    git commit -q -m '[PO-S10] setup: run layout'
    $out += ('HEAD after layout commit: ' + (git log --oneline -1))
    $out += ('evidence folder visible: ' + (Test-Path "$S10Repo\evidence"))
    $out += ('evidence paths tracked at HEAD: ' + @(git ls-files evidence).Count)
    $env:CLAUDE_CODE_DISABLE_AUTO_MEMORY = '1'
    $out += ('CLAUDE_CODE_DISABLE_AUTO_MEMORY: ' + $env:CLAUDE_CODE_DISABLE_AUTO_MEMORY)
    $out += ('files in the Claude memory folder: ' + (Get-S10Memory))
    $out += ('node: ' + (node --version) + ', tsc: ' + (npx tsc --version))
    $b = (npm run build:server 2>&1 | Out-String)
    $out += ('error TS lines in the build: ' + ([regex]::Matches($b, 'error TS')).Count)
    $t = (npm test 2>&1 | Out-String)
    $out += ('error TS lines in npm test: ' + ([regex]::Matches($t, 'error TS')).Count)
    $out += ('test lines: ' + ((($t -split "`n") | Select-String -Pattern 'passing|failing') -join ' | '))
    if (Test-Path $S10Base) { Remove-Item $S10Base -Recurse -Force }
    Copy-Item "$S10Repo\dist-server" $S10Base -Recurse
    $out += ('baseline files copied: ' + (Get-ChildItem $S10Base -Recurse -File).Count)
    $s = Get-Content "$S10Repo\.claude\settings.local.json" -Raw | ConvertFrom-Json
    $out += ('permissions: mode ' + $s.permissions.defaultMode + ', allow ' + $s.permissions.allow.Count + ', deny ' + $s.permissions.deny.Count + ', autoMemoryEnabled ' + $s.autoMemoryEnabled)
    $out += ('git status: ' + (@(git status --short) -join ' | '))
    $out | Set-Content -Path "$S10Hold\preflight.txt" -Encoding ASCII
    $out
    Write-Host ''
    Write-Host 'Start claude from THIS PowerShell window (the memory setting above is only set here).'
}

function Prompt-S10 {
    Get-Content -Raw "$S10Hold\PO-S10-prompt.md" | Set-Clipboard
    Write-Host 'The PO-S10 prompt is on the clipboard. Paste it into the new Claude session.'
}

function Backup-S10 {
    $proj = Get-ChildItem "$env:USERPROFILE\.claude\projects" -Directory | Where-Object { $_.Name -like '*audiobookshelf-po*' } | Select-Object -First 1
    $log = Get-ChildItem $proj.FullName -Filter *.jsonl | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    $sid = $log.BaseName
    $dest = 'D:\SEM-2\574\Project\po-session-backup\PO-S10'
    New-Item -ItemType Directory -Force -Path $dest | Out-Null
    Copy-Item $log.FullName $dest -Force
    $sub = Join-Path $proj.FullName $sid
    if (Test-Path $sub) { Copy-Item $sub $dest -Recurse -Force }
    $roots = @(Get-ChildItem $env:TEMP -Directory -Filter 'claude*' -ErrorAction SilentlyContinue)
    $sp = $null
    foreach ($r in $roots) {
        $sp = Get-ChildItem $r.FullName -Recurse -Directory -Filter scratchpad -ErrorAction SilentlyContinue | Where-Object { $_.FullName -like "*$sid*" } | Select-Object -First 1
        if ($sp) { break }
    }
    $store = 'D:\SEM-2\574\Project\po-s10-store'
    New-Item -ItemType Directory -Force -Path $store | Out-Null
    if ($sp) { Copy-Item $sp.FullName "$store\scratchpad" -Recurse -Force }
    Write-Host ('session id: ' + $sid)
    Write-Host ('log files: ' + (Get-ChildItem $dest -Recurse -File).Count)
    Write-Host ('log MB: ' + [math]::Round(((Get-ChildItem $dest -Recurse -File | Measure-Object Length -Sum).Sum / 1MB), 1))
    if ($sp) { Write-Host ('scratchpad files: ' + (Get-ChildItem "$store\scratchpad" -Recurse -File).Count) } else { Write-Host 'scratchpad folder not found' }
    Write-Host ('files in the Claude memory folder: ' + (Get-S10Memory))
}

function Restore-S10 {
    Set-Location $S10Repo
    $h = git log --grep 'setup: run layout' -n 1 --format=%H
    if (-not $h) { Write-Host 'layout commit not found'; return }
    git revert --no-edit $h | Out-Null
    Write-Host ('evidence folder visible: ' + (Test-Path "$S10Repo\evidence"))
    Write-Host ('evidence paths tracked at HEAD: ' + @(git ls-files evidence).Count)
    git status --short
    git log --oneline -4
}

function Move-S10Memory {
    $proj = Get-ChildItem "$env:USERPROFILE\.claude\projects" -Directory | Where-Object { $_.Name -like '*audiobookshelf-po*' } | Select-Object -First 1
    $mem = Join-Path $proj.FullName 'memory'
    $dest = 'D:\SEM-2\574\Project\po-s10-hold\agent-memory'
    if (-not (Test-Path $mem)) { Write-Host 'memory folder not found (nothing to move)'; return }
    New-Item -ItemType Directory -Force -Path $dest | Out-Null
    Get-ChildItem $mem -File | ForEach-Object { Move-Item $_.FullName $dest -Force }
    Write-Host ('files now in agent-memory: ' + @(Get-ChildItem $dest -File).Count)
    Write-Host ('files left in the Claude memory folder: ' + (Get-S10Memory))
}
