param(
    [Parameter(Mandatory = $true)][string]$SourceFile,
    [Parameter(Mandatory = $true)][string]$OutputDir,
    [Parameter(Mandatory = $true)][string]$CacheDir,
    [string]$WebView2Version = "1.0.3856.49",
    [string]$IconFile = ""
)

$ErrorActionPreference = "Stop"

function Resolve-CscPath {
    $candidates = @(
        "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe",
        "C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe"
    )
    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            return $candidate
        }
    }
    throw "csc.exe not found"
}

function Ensure-Directory {
    param([string]$Path)
    if (-not (Test-Path $Path)) {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
    }
}

function Ensure-WebView2Package {
    param([string]$DestinationPath, [string]$Version)
    if (Test-Path $DestinationPath) {
        return
    }
    $url = "https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/$Version/microsoft.web.webview2.$Version.nupkg"
    Invoke-WebRequest -Uri $url -OutFile $DestinationPath
}

Ensure-Directory -Path $OutputDir
Ensure-Directory -Path $CacheDir

$cscPath = Resolve-CscPath
$packagePath = Join-Path $CacheDir "microsoft.web.webview2.$WebView2Version.nupkg"
$extractDir = Join-Path $CacheDir "webview2-$WebView2Version"
$buildDir = Join-Path ([IO.Path]::GetTempPath()) ("clowder-webview2-launcher-" + [Guid]::NewGuid().ToString("N"))
$outputExe = Join-Path $buildDir "ClowderAI.Desktop.exe"
$localSourceFile = Join-Path $buildDir ([IO.Path]::GetFileName($SourceFile))
$coreDllPath = Join-Path $extractDir "lib\net462\Microsoft.Web.WebView2.Core.dll"

Ensure-WebView2Package -DestinationPath $packagePath -Version $WebView2Version

if ((Test-Path $extractDir) -and -not (Test-Path $coreDllPath)) {
    Remove-Item -Path $extractDir -Recurse -Force
}

if (-not (Test-Path $extractDir)) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [IO.Compression.ZipFile]::ExtractToDirectory($packagePath, $extractDir)
}

if (Test-Path $buildDir) {
    Remove-Item -Path $buildDir -Recurse -Force
}
Ensure-Directory -Path $buildDir
Copy-Item -Path $SourceFile -Destination $localSourceFile -Force

$frameworkDir = Split-Path -Parent $cscPath
$frameworkReferences = @(
    (Join-Path $frameworkDir "System.dll"),
    (Join-Path $frameworkDir "System.Core.dll"),
    (Join-Path $frameworkDir "System.Drawing.dll"),
    (Join-Path $frameworkDir "System.Windows.Forms.dll")
)
$sdkFiles = @(
    (Join-Path $extractDir "lib\net462\Microsoft.Web.WebView2.Core.dll"),
    (Join-Path $extractDir "lib\net462\Microsoft.Web.WebView2.WinForms.dll"),
    (Join-Path $extractDir "runtimes\win-x64\native\WebView2Loader.dll")
)

$localSdkFiles = @()
foreach ($sdkFile in $sdkFiles) {
    if (-not (Test-Path $sdkFile)) {
        throw "Missing SDK file: $sdkFile"
    }
    $localPath = Join-Path $buildDir ([IO.Path]::GetFileName($sdkFile))
    Copy-Item -Path $sdkFile -Destination $localPath -Force
    $localSdkFiles += $localPath
}

$compileArgs = @(
    "/nologo",
    "/target:winexe",
    "/platform:x64",
    "/out:$outputExe"
)

if ($IconFile -and (Test-Path $IconFile)) {
    $compileArgs += "/win32icon:$IconFile"
}

foreach ($reference in ($frameworkReferences + $localSdkFiles[0..1])) {
    if (-not (Test-Path $reference)) {
        throw "Missing reference: $reference"
    }
    $compileArgs += "/r:$reference"
}

$compileArgs += $localSourceFile

& $cscPath @compileArgs
if ($LASTEXITCODE -ne 0) {
    throw "Launcher compilation failed with exit code $LASTEXITCODE"
}

@"
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <startup>
    <supportedRuntime version="v4.0" sku=".NETFramework,Version=v4.7.2" />
  </startup>
</configuration>
"@ | Set-Content -Path "$outputExe.config" -Encoding ASCII

Copy-Item -Path $outputExe -Destination (Join-Path $OutputDir "ClowderAI.Desktop.exe") -Force
Copy-Item -Path "$outputExe.config" -Destination (Join-Path $OutputDir "ClowderAI.Desktop.exe.config") -Force
foreach ($runtimeFile in $localSdkFiles) {
    Copy-Item -Path $runtimeFile -Destination (Join-Path $OutputDir ([IO.Path]::GetFileName($runtimeFile))) -Force
}

Remove-Item -Path $buildDir -Recurse -Force
