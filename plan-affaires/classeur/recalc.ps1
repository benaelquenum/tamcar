# Recalcule (Excel) tous les classeurs .xlsx d'un dossier, ou un seul fichier : valeurs en cache à jour.
# Usage : powershell -File recalc.ps1 -Path <dossier ou fichier>
param([Parameter(Mandatory = $true)][string]$Path)
$xl = New-Object -ComObject Excel.Application
$xl.Visible = $false
$xl.DisplayAlerts = $false
try {
  if (Test-Path -PathType Container $Path) { $files = Get-ChildItem $Path -Filter *.xlsx } else { $files = @(Get-Item $Path) }
  foreach ($f in $files) {
    $wb = $xl.Workbooks.Open($f.FullName)
    $xl.CalculateFull()
    $wb.Save()
    $wb.Close($false)
  }
  "recalcul : OK (" + $files.Count + " fichier(s))"
} catch {
  "ERREUR : " + $_.Exception.Message
} finally {
  $xl.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($xl) | Out-Null
}
