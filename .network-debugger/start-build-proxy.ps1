# Powershell Script to Start the Build-Time Proxy

Write-Host "[DEBUG] Starting MITMProxy Container..." -ForegroundColor Cyan

# Check if port 8888 is free
$portBusy = Get-NetTCPConnection -LocalPort 1981 -ErrorAction SilentlyContinue
if ($portBusy) {
    Write-Host "[ERROR] Port 1981 is already in use. Please free it up." -ForegroundColor Red
    exit 1
}

# Run mitmproxy
# We map the web interface to 8081 just in case you want to see the UI
# The proxy listens on 8080 inside the container, we map to 1981 on host.
docker run --rm -d `
    --name n8n-build-proxy `
    -p 1981:8080 `
    -p 127.0.0.1:8081:8081 `
    mitmproxy/mitmproxy `
    mitmweb --web-host 0.0.0.0 --set block_global=false

Write-Host "[SUCCESS] Proxy started on http://localhost:1981" -ForegroundColor Green
