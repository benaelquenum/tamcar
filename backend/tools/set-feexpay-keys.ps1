# Pose les clés FeexPay là où les fonctions de paiement les lisent, SANS qu'aucune valeur ne passe par Claude :
#   Supabase (secrets des fonctions feexpay-pay, feexpay-verify, feexpay-webhook) :
#     FEEXPAY_API_KEY (clé privée), FEEXPAY_SHOP_ID, FEEXPAY_MODE, FEEXPAY_API_URL, FEEXPAY_WEBHOOK_SECRET
# FeexPay appelle l'API depuis le SERVEUR : aucune clé n'est posée dans les applications (pas de variable Vercel).
#
# Usage (terminal PowerShell) :
#   powershell -ExecutionPolicy Bypass -File D:\TERENCE\TamCar\App\backend\tools\set-feexpay-keys.ps1                 # sandbox (aucun argent réel)
#   powershell -ExecutionPolicy Bypass -File D:\TERENCE\TamCar\App\backend\tools\set-feexpay-keys.ps1 -Mode live      # production (argent réel)
#   ... -WebhookSecret "<secret>"   pour réutiliser le secret déjà déclaré chez FeexPay (sinon un nouveau est généré et affiché)
#
# Où trouver les valeurs : tableau de bord FeexPay → boutique TamCar → « Développeurs » (clé privée et identifiant de la boutique).
# Sandbox : tableau de bord https://sandbox-app.feexpay.me (compte de test séparé), clés préfixées test_key_.
# Le secret du webhook est généré ici : à copier dans FeexPay → Webhooks → authentification « Bearer ».
param(
  [ValidateSet('sandbox', 'live')][string]$Mode = 'sandbox',
  [string]$WebhookSecret = ''
)

$ErrorActionPreference = 'Continue'
$projectRef = 'psoukliivojfjltkwtwd'
$apiUrl = if ($Mode -eq 'live') { 'https://api-v2.feexpay.me' } else { 'https://sandbox-api.feexpay.me' }

function Read-Secret([string]$label) {
  $s = Read-Host -Prompt $label -AsSecureString
  $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
}

Write-Host "Mode : $Mode  (API $apiUrl)" -ForegroundColor Cyan
if ($Mode -eq 'live') {
  $ok = Read-Host "Mode LIVE = argent réel. Tapez LIVE pour confirmer"
  if ($ok -ne 'LIVE') { throw 'Annulé.' }
}

$shop = (Read-Host 'Identifiant de la boutique TamCar (page « Boutiques » ou « Développeurs »)').Trim()
if ($shop -notmatch '^[A-Za-z0-9]{10,}$') { throw 'Identifiant de boutique invalide (lettres et chiffres, au moins 10 caractères).' }

$key = (Read-Secret 'Clé PRIVÉE FeexPay').Trim()
if ($Mode -eq 'sandbox' -and $key -notmatch '^test_key_') { throw 'En mode sandbox, la clé privée commence par test_key_ (clé du tableau de bord sandbox).' }
if ($Mode -eq 'live' -and ($key -match '^test_key_' -or $key.Length -lt 20)) { throw 'En mode live, collez la clé privée de PRODUCTION (pas une clé test_key_).' }

$generated = $false
if ($WebhookSecret.Length -lt 16) {
  $bytes = New-Object byte[] 30
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $WebhookSecret = ([Convert]::ToBase64String($bytes) -replace '[^A-Za-z0-9]', 'x')
  $generated = $true
}

$envFile = Join-Path $env:TEMP ("feexpay-" + [guid]::NewGuid().ToString('N') + '.env')
try {
  Set-Content -Path $envFile -Value @(
    "FEEXPAY_API_KEY=$key",
    "FEEXPAY_SHOP_ID=$shop",
    "FEEXPAY_MODE=$Mode",
    "FEEXPAY_API_URL=$apiUrl",
    "FEEXPAY_WEBHOOK_SECRET=$WebhookSecret"
  ) -Encoding ascii
  supabase secrets set --env-file $envFile --project-ref $projectRef 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Échec de supabase secrets set.' }
} finally { Remove-Item $envFile -Force -ErrorAction SilentlyContinue }
Write-Host 'Supabase : secrets FeexPay posés.' -ForegroundColor Green

if ($generated) {
  Write-Host ''
  Write-Host 'SECRET DU WEBHOOK (à copier maintenant dans FeexPay → Webhooks → authentification Bearer) :' -ForegroundColor Yellow
  Write-Host $WebhookSecret -ForegroundColor White
  Write-Host 'Il ne sera plus affiché. En cas de perte, relancez ce script : un nouveau secret sera généré.' -ForegroundColor Yellow
}
Write-Host ''
Write-Host "Terminé. Dites à Claude « clés posées » : il active le paiement réel (réglage payments_provider) et lance le test." -ForegroundColor Cyan
