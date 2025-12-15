# Configuración
$User = "ubuntu"
$Server = "51.222.204.200"
$RemotePath = "~/backups/"
# Puedes cambiar esto a "\\wsl.localhost\Ubuntu\home\jorge" si deseas, pero asegúrate que WSL esté corriendo.
#$LocalPath = "C:\Users\alejo\Documents\cambios-los-chamos" 
$LocalPath = "\\wsl.localhost\Ubuntu\home\jorge" # Descomenta para usar WSL

Write-Host "Conectando a $Server para buscar el backup más reciente..." -ForegroundColor Cyan

# 1. Obtener el nombre del archivo más reciente
# Usamos ls -t (tiempo) | head -1 (el primero)
$LatestFile = ssh $User@$Server "ls -t $RemotePath*.sql | head -1"

if (-not $LatestFile) {
    Write-Host "Error: No se encontraron archivos .sql en $RemotePath" -ForegroundColor Red
    exit
}

# Limpiar espacios en blanco del nombre (por si acaso)
$LatestFile = $LatestFile.Trim()
Write-Host "Archivo más reciente encontrado: $LatestFile" -ForegroundColor Green

# 2. Construir la ruta local completa
$FileName = Split-Path $LatestFile -Leaf
$Destination = Join-Path $LocalPath $FileName

# 3. Descargar usando SCP
Write-Host "Descargando a $Destination ..." -ForegroundColor Cyan
scp "$User@$Server`:$LatestFile" "$Destination"

if ($LASTEXITCODE -eq 0) {
    Write-Host "¡Descarga completada exitosamente!" -ForegroundColor Green
    Write-Host "Ubicación: $Destination"
} else {
    Write-Host "Hubo un error en la descarga." -ForegroundColor Red
}
