param([string]$LiveSplitDir = 'C:\Program Files (x86)\Livesplit')
$ErrorActionPreference = 'Stop'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe'
$destination = Join-Path $PSScriptRoot 'dist'
New-Item -ItemType Directory -Force -Path $destination | Out-Null
$refs = @('LiveSplit.Core.dll', 'UpdateManager.dll', 'SpeedrunComSharp.dll') | ForEach-Object { '/r:' + (Join-Path $LiveSplitDir $_) }
& $compiler /nologo /target:library /optimize+ /platform:anycpu "/out:$destination\LiveSplit.ZombiesTracker.dll" /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Web.Extensions.dll /r:System.Net.Http.dll /r:System.Security.dll $refs "$PSScriptRoot\AddonUpdates.cs" "$PSScriptRoot\Detection.cs" "$PSScriptRoot\AutosplitBridge.cs" "$PSScriptRoot\SplitAliases.cs" "$PSScriptRoot\ManualAliases.cs" "$PSScriptRoot\Protocol.cs" "$PSScriptRoot\UploadQueue.cs" "$PSScriptRoot\Component.cs" "$PSScriptRoot\Protection.cs"
if ($LASTEXITCODE -ne 0) { throw 'Component compilation failed.' }
Write-Output "Built $destination\LiveSplit.ZombiesTracker.dll"
