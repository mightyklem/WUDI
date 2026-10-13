$ErrorActionPreference = 'Stop'
# Local signing bootstrap. Run this ONCE. It prints the four GitHub Actions
# secrets you need and writes them to android-signing-secrets.txt next to this
# script so you can copy them without opening them in chat or in git.
#
# Delete android-signing-secrets.txt once the secrets are in GitHub. Both this
# file's output and the keystore itself are gitignored.

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$ks = Join-Path $here 'learnovize-upload.jks'
$storePass = 'LrnLearnovize2026'
$keyPass   = 'LrnLearnovize2026'
$alias     = 'learnovize-upload'

if (-not (Test-Path $ks)) { throw "Keystore not found at $ks" }

$b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($ks))

$lines = @(
  '# GitHub Actions secrets for the Android release build.'
  '# Repository -> Settings -> Secrets and variables -> Actions -> New repository secret.'
  '# Add each value below as its own secret, then delete this file.'
  ''
  'ANDROID_KEYSTORE_BASE64'
  $b64
  ''
  'ANDROID_KEYSTORE_PASSWORD'
  $storePass
  ''
  'ANDROID_KEY_ALIAS'
  $alias
  ''
  'ANDROID_KEY_PASSWORD'
  $keyPass
  ''
  '# SHA-256 of the upload certificate. Copy this into Netlify as'
  '# TWA_SHA256_FINGERPRINTS so the app opens fullscreen without the browser bar.'
  'TWA_SHA256_FINGERPRINT'
  (& keytool -list -v -keystore $ks -alias $alias -storepass $storePass | Select-String 'SHA256:' | ForEach-Object { $_.Line -replace '.*SHA256:\s*','' })
)

$out = Join-Path $here 'android-signing-secrets.txt'
$lines | Set-Content -LiteralPath $out -Encoding utf8

Write-Output "Written to: $out"
Write-Output ''
Write-Output 'Add these four as GitHub Actions secrets:'
Write-Output '  ANDROID_KEYSTORE_BASE64   (the long base64 block)'
Write-Output '  ANDROID_KEYSTORE_PASSWORD'
Write-Output '  ANDROID_KEY_ALIAS'
Write-Output '  ANDROID_KEY_PASSWORD'
Write-Output ''
Write-Output 'Then add this to Netlify as TWA_SHA256_FINGERPRINTS:'
Write-Output "  $($lines[-1])"
Write-Output ''
Write-Output 'Delete this file once the secrets are in place.'