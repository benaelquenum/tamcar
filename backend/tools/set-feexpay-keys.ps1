# Pose les clés FeexPay là où les fonctions de paiement les lisent, SANS qu'aucune valeur ne passe par Claude :
#   Supabase (secrets des fonctions feexpay-pay, feexpay-verify, feexpay-webhook) :
#     FEEXPAY_API_KEY (clé privée), FEEXPAY_SHOP_ID, FEEXPAY_MODE, FEEXPAY_API_URL (+ FEEXPAY_WEBHOOK_SECRET si -WebhookSecret est fourni)
# FeexPay appelle l'API depuis le SERVEUR : aucune clé n'est posée dans les applications (pas de variable Vercel).
#
# Usage (terminal PowerShell) :
#   powershell -ExecutionPolicy Bypass -File D:\TERENCE\TamCar\App\backend\tools\set-feexpay-keys.ps1                 # sandbox (aucun argent réel)
#   powershell -ExecutionPolicy Bypass -File D:\TERENCE\TamCar\App\backend\tools\set-feexpay-keys.ps1 -Mode live      # production (argent réel)
#   ... -WebhookSecret "<secret>"   facultatif : le secret saisi dans FeexPay → Webhooks (en-tête Authorization). Sans lui le webhook n'est pas
#                                  authentifié, ce qui reste sûr : son contenu n'est jamais cru, le statut est relu auprès de FeexPay.
#
# Où trouver les valeurs : tableau de bord FeexPay → boutique TamCar sélectionnée → « Développeurs » (clé privée) ; l'identifiant de la
# boutique s'affiche sur le tableau de bord (carte « Solde total », ligne « ID »).
# Sandbox : tableau de bord https://sandbox-app.feexpay.me (compte de test séparé), clés préfixées test_key_.
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

$envFile = Join-Path $env:TEMP ("feexpay-" + [guid]::NewGuid().ToString('N') + '.env')
try {
  $lines = @("FEEXPAY_API_KEY=$key", "FEEXPAY_SHOP_ID=$shop", "FEEXPAY_MODE=$Mode", "FEEXPAY_API_URL=$apiUrl")
  if ($WebhookSecret.Length -ge 8) { $lines += "FEEXPAY_WEBHOOK_SECRET=$WebhookSecret" }
  Set-Content -Path $envFile -Value $lines -Encoding ascii
  supabase secrets set --env-file $envFile --project-ref $projectRef 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Échec de supabase secrets set.' }
} finally { Remove-Item $envFile -Force -ErrorAction SilentlyContinue }
Write-Host 'Supabase : secrets FeexPay posés.' -ForegroundColor Green

Write-Host ''
Write-Host "Terminé. Dites à Claude « clés posées » : il active le paiement réel (réglage payments_provider) et lance le test." -ForegroundColor Cyan
