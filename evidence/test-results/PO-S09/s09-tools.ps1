$S09Repo = 'D:\SEM-2\574\Project\audiobookshelf-po'
$S09Hold = 'D:\SEM-2\574\Project\po-s09-hold'
$S09Base = 'D:\SEM-2\574\Project\po-s09-baseline'

function Prep-S09 {
    Set-Location $S09Repo
    $out = @()
    $out += 'PO-S09 preflight (run by the user with Prep-S09)'
    $out += ('date: ' + (Get-Date -Format 'yyyy-MM-dd HH:mm'))
    $out += ('HEAD: ' + (git log --oneline -1))
    $out += ('node: ' + (node --version) + ', tsc: ' + (npx tsc --version))
    git sparse-checkout set --no-cone '/*' '!/evidence/'
    $out += ('evidence folder visible: ' + (Test-Path "$S09Repo\evidence"))
    $out += 'git status after hiding evidence:'
    $out += @(git status --short)
    $b = (npm run build:server 2>&1 | Out-String)
    $out += ('error TS lines in the build: ' + ([regex]::Matches($b, 'error TS')).Count)
    $t = (npm test 2>&1 | Out-String)
    $out += ('error TS lines in npm test: ' + ([regex]::Matches($t, 'error TS')).Count)
    $out += ('test lines: ' + ((($t -split "`n") | Select-String -Pattern 'passing|failing') -join ' | '))
    if (Test-Path $S09Base) { Remove-Item $S09Base -Recurse -Force }
    Copy-Item "$S09Repo\dist-server" $S09Base -Recurse
    $out += ('baseline files copied: ' + (Get-ChildItem $S09Base -Recurse -File).Count)
    $s = Get-Content "$S09Repo\.claude\settings.local.json" -Raw | ConvertFrom-Json
    $out += ('permissions: mode ' + $s.permissions.defaultMode + ', allow ' + $s.permissions.allow.Count + ', deny ' + $s.permissions.deny.Count)
    $out | Set-Content -Path "$S09Hold\preflight.txt" -Encoding ASCII
    $out
}

function Prompt-S09 {
    Get-Content -Raw "$S09Hold\PO-S09-prompt.md" | Set-Clipboard
    Write-Host 'The PO-S09 prompt is on the clipboard. Paste it into the new Claude session.'
}

function Backup-S09 {
    $proj = Get-ChildItem "$env:USERPROFILE\.claude\projects" -Directory | Where-Object { $_.Name -like '*audiobookshelf-po*' } | Select-Object -First 1
    $log = Get-ChildItem $proj.FullName -Filter *.jsonl | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    $sid = $log.BaseName
    $dest = 'D:\SEM-2\574\Project\po-session-backup\PO-S09'
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
    $store = 'D:\SEM-2\574\Project\po-s09-store'
    New-Item -ItemType Directory -Force -Path $store | Out-Null
    if ($sp) { Copy-Item $sp.FullName "$store\scratchpad" -Recurse -Force }
    Write-Host ('session id: ' + $sid)
    Write-Host ('log files: ' + (Get-ChildItem $dest -Recurse -File).Count)
    Write-Host ('log MB: ' + [math]::Round(((Get-ChildItem $dest -Recurse -File | Measure-Object Length -Sum).Sum / 1MB), 1))
    if ($sp) { Write-Host ('scratchpad files: ' + (Get-ChildItem "$store\scratchpad" -Recurse -File).Count) } else { Write-Host 'scratchpad folder not found' }
}

function Restore-S09 {
    Set-Location $S09Repo
    git sparse-checkout disable
    Write-Host ('evidence folder visible: ' + (Test-Path "$S09Repo\evidence"))
    git status --short
    git log --oneline -3
}

function Hide-S09 {
    Set-Location $S09Repo
    git status --short | Out-Null
    git sparse-checkout reapply
    Write-Host ('evidence folder visible: ' + (Test-Path "$S09Repo\evidence"))
    if (Test-Path "$S09Repo\evidence") { Write-Host ('evidence files left: ' + (Get-ChildItem "$S09Repo\evidence" -Recurse -File).Count) }
    Write-Host 'git status:'
    git status --short
}

function Move-S09Memory {
    $proj = Get-ChildItem "$env:USERPROFILE\.claude\projects" -Directory | Where-Object { $_.Name -like '*audiobookshelf-po*' } | Select-Object -First 1
    $mem = Join-Path $proj.FullName 'memory'
    $dest = 'D:\SEM-2\574\Project\po-s09-hold\agent-memory'
    if (-not (Test-Path $mem)) { Write-Host 'memory folder not found'; return }
    New-Item -ItemType Directory -Force -Path $dest | Out-Null
    Get-ChildItem $mem -File | ForEach-Object { Move-Item $_.FullName $dest -Force }
    Write-Host ('files now in agent-memory: ' + @(Get-ChildItem $dest -File).Count)
    Write-Host ('files left in the Claude memory folder: ' + @(Get-ChildItem $mem -File -ErrorAction SilentlyContinue).Count)
}
