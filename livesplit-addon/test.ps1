param([string]$LiveSplitDir = 'C:\Program Files (x86)\Livesplit')
$ErrorActionPreference = 'Stop'
& "$PSScriptRoot\build.ps1" -LiveSplitDir $LiveSplitDir
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe'
$testDir = Join-Path $PSScriptRoot 'test-bin'
New-Item -ItemType Directory -Force -Path $testDir | Out-Null
Copy-Item -LiteralPath "$PSScriptRoot\dist\LiveSplit.ZombiesTracker.dll" -Destination $testDir -Force
# Test dependencies stay in test-bin, never in the distributable archive.
Get-ChildItem -LiteralPath $LiveSplitDir -Filter '*.dll' | Copy-Item -Destination $testDir -Force
$refs = @('LiveSplit.Core.dll','UpdateManager.dll','SpeedrunComSharp.dll') | ForEach-Object { '/r:' + (Join-Path $LiveSplitDir $_) }
& $compiler /nologo /target:library /define:TESTING /platform:anycpu "/out:$testDir\LiveSplit.ZombiesTracker.dll" /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Web.Extensions.dll /r:System.Net.Http.dll /r:System.Security.dll $refs "$PSScriptRoot\AddonUpdates.cs" "$PSScriptRoot\Detection.cs" "$PSScriptRoot\Protocol.cs" "$PSScriptRoot\UploadQueue.cs" "$PSScriptRoot\Component.cs" "$PSScriptRoot\Protection.cs"
if ($LASTEXITCODE -ne 0) { throw 'Test component compilation failed.' }
& $compiler /nologo /target:exe /platform:anycpu "/out:$testDir\Tests.exe" /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Security.dll "/r:$testDir\LiveSplit.ZombiesTracker.dll" $refs "$PSScriptRoot\Tests.cs"
if ($LASTEXITCODE -ne 0) { throw 'Test compilation failed.' }
& "$testDir\Tests.exe"
if ($LASTEXITCODE -ne 0) { throw 'Addon tests failed.' }
