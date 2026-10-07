# Pose les clés FedaPay là où l'application les lit, SANS qu'aucune valeur ne passe par Claude ni ne soit affichée :
#   - Supabase (secrets des fonctions) : FEDAPAY_SECRET_KEY, FEDAPAY_WEBHOOK_SECRET, FEDAPAY_API_URL
#   - Vercel (clé PUBLIQUE, lue par le navigateur) : NEXT_PUBLIC_FEDAPAY_PUBLIC_KEY sur tamcar-client ET tamcar-driver-portal
# Usage (terminal PowerShell) :
#   powershell -ExecutionPolicy Bypass -File D:\TERENCE\TamCar\App\backend\tools\set-fedapay-keys.ps1                  # sandbox, tout
#   powershell -ExecutionPolicy Bypass -File D:\TERENCE\TamCar\App\backend\tools\set-fedapay-keys.ps1 -VercelOnly      # sandbox, clé publique seulement
#   powershell -ExecutionPolicy Bypass -File D:\TERENCE\TamCar\App\backend\tools\set-fedapay-keys.ps1 -Mode live       # production (argent réel)
# Les clés se copient depuis le tableau de bord FedaPay : page « Api » (clé publique, clé secrète) et page « Webhooks » (secret du webhook).
param(
  [ValidateSet('sandbox', 'live')][string]$Mode = 'sandbox',
  [switch]$VercelOnly
)

# 'Continue' et non 'Stop' : certaines CLI écrivent des messages d'information sur la sortie d'erreur, ce qui, en mode 'Stop',
# arrêtait le script au premier appel Vercel. Les échecs réels sont détectés avec $LASTEXITCODE et les relectures.
$ErrorActionPreference = 'Continue'
$projectRef = 'psoukliivojfjltkwtwd'
$vercelProjects = @('tamcar-client', 'tamcar-driver-portal')
$apiUrl = if ($Mode -eq 'live') { 'https://api.fedapay.com/v1' } else { 'https://sandbox-api.fedapay.com/v1' }

function Read-Secret([string]$label) {
  $s = Read-Host -Prompt $label -AsSecureString
  $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
}

function Get-VercelEnv([string]$proj) {
  $raw = vercel api "/v10/projects/$proj/env" --raw 2>$null | Out-String
  $i = $raw.IndexOf('{')
  if ($i -lt 0) { throw "Vercel : impossible de lire les variables de $proj (êtes-vous connecté ? commande : vercel login)." }
  return @(($raw.Substring($i) | ConvertFrom-Json).envs)
}

Write-Host "Mode : $Mode  (API $apiUrl)$(if ($VercelOnly) { '  - Vercel seulement' })" -ForegroundColor Cyan
if ($Mode -eq 'live') {
  $ok = Read-Host "Mode LIVE = argent réel. Tapez LIVE pour confirmer"
  if ($ok -ne 'LIVE') { throw 'Annulé.' }
}

$pk = (Read-Host 'Clé PUBLIQUE FedaPay (pk_...)').Trim()
if ($pk -notmatch "^pk_$Mode" + '_') { throw "La clé publique doit commencer par pk_${Mode}_ (mode $Mode)." }

if (-not $VercelOnly) {
  $sk = (Read-Secret 'Clé SECRÈTE FedaPay (sk_...)').Trim()
  $wh = (Read-Secret 'Secret du WEBHOOK (page Webhooks)').Trim()
  if ($sk -notmatch "^sk_$Mode" + '_') { throw "La clé secrète doit commencer par sk_${Mode}_ (mode $Mode)." }
  if ($wh.Length -lt 8) { throw 'Secret du webhook trop court : copiez-le en entier.' }

  # 1. Supabase : fichier temporaire supprimé aussitôt
  $envFile = Join-Path $env:TEMP ("fedapay-" + [guid]::NewGuid().ToString('N') + '.env')
  try {
    Set-Content -Path $envFile -Value @("FEDAPAY_SECRET_KEY=$sk", "FEDAPAY_WEBHOOK_SECRET=$wh", "FEDAPAY_API_URL=$apiUrl") -Encoding ascii
    supabase secrets set --env-file $envFile --project-ref $projectRef 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Échec de supabase secrets set.' }
  } finally { Remove-Item $envFile -Force -ErrorAction SilentlyContinue }
  Write-Host 'Supabase : secrets FedaPay posés.' -ForegroundColor Green
}

# 2. Vercel : la clé publique (remplace l'ancienne valeur), puis relecture pour vérifier
foreach ($proj in $vercelProjects) {
  foreach ($e in @(Get-VercelEnv $proj | Where-Object { $_.key -eq 'NEXT_PUBLIC_FEDAPAY_PUBLIC_KEY' })) {
    vercel api "/v9/projects/$proj/env/$($e.id)" -X DELETE --dangerously-skip-permissions --silent 2>$null | Out-Null
  }
  $body = Join-Path $env:TEMP ("vercel-env-" + [guid]::NewGuid().ToString('N') + '.json')
  try {
    (@{ key = 'NEXT_PUBLIC_FEDAPAY_PUBLIC_KEY'; value = $pk; type = 'plain'; target = @('production') } | ConvertTo-Json -Compress) | Set-Content -Path $body -Encoding ascii
    vercel api "/v10/projects/$proj/env" -X POST --input $body --silent 2>$null | Out-Null
  } finally { Remove-Item $body -Force -ErrorAction SilentlyContinue }
  $now = @(Get-VercelEnv $proj | Where-Object { $_.key -eq 'NEXT_PUBLIC_FEDAPAY_PUBLIC_KEY' })
  if ($now.Count -eq 1) { Write-Host "Vercel $proj : clé publique posée." -ForegroundColor Green }
  else { Write-Host "Vercel $proj : ÉCHEC (variable absente après la pose)." -ForegroundColor Red }
}
Write-Host "Terminé. Dites à Claude « clés posées » : il redéploie les deux applications et lance le test de paiement." -ForegroundColor Cyan
