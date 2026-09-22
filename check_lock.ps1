cd C:\Users\Usuario\TMS\apps\web
$json = Get-Content package-lock.json -Raw | ConvertFrom-Json
$names = $json.packages.PSObject.Properties.Name
Write-Host "TOTAL_PACKAGES:" $names.Count
Write-Host "HAS_NEXT_SWC:" (($names -match "@swc").Count)
Write-Host "HAS_WEBPACK:" (($names -match "webpack").Count)
