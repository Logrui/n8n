# Network Debugging & Isolation Environment for n8n

This directory contains a specialized "Network Guard" and "Build Proxy" setup designed to debug, log, and restrict network traffic for the `n8n` container.

**Purpose:**
1.  **Build Time Visibility**: Route all `docker build` traffic through a local `mitmproxy` to see exactly what external resources are being fetched during the build (npm packages, binaries, etc.).
2.  **Runtime Isolation**: Run `n8n` behind a strict "Guard" container (`n8n-guard`) that acts as a firewall. It **drops** all outbound traffic to the internet by default and **logs** every attempt, allowing only internal connections (Postgres, Localhost).

---

## 🚀 Quick Start Guide

### Prerequisites
- Docker Desktop (Windows/Mac/Linux)
- PowerShell (or Bash on Linux/Mac)

### 1. Start the Build Proxy (MITM)
Start the proxy to inspect build traffic.
```powershell
.network-debugger/start-build-proxy.ps1
```
- **Proxy Port**: `localhost:1981`
- **Web Interface**: `http://localhost:8081` (Open this to see live traffic!)
- **Note**: This proxy disables SSL verification (`strict-ssl=false`) for the build process to inspect HTTPS traffic.

### 2. Build & Start the Debug Environment
Run the following command to build `n8n` using the proxy and start it behind the firewall.
```powershell
docker compose -f docker-compose.yaml -f .network-debugger/docker-compose.debug.yaml up -d --build
```
- This will take a few minutes for the first build.
- Watch the `mitmproxy` web UI (`http://localhost:8081`) to see what is being downloaded!

### 3. Access n8n
Once running, access n8n as usual:
- **URL**: [http://localhost:56781](http://localhost:56781)

### 4. Monitor Runtime Traffic (Firewall Logs)
To see what `n8n` is trying to access (and getting blocked):
```powershell
docker logs -f n8n-guard
```
- Look for `[N8N-OUTBOUND]` entries. These are blocked connection attempts.

### 5. Cleanup
To stop everything and remove the debug containers:
```powershell
docker compose -f docker-compose.yaml -f .network-debugger/docker-compose.debug.yaml down
```
To stop the proxy:
```powershell
docker stop n8n-build-proxy
```

---

## 📂 Architecture

- **`docker-compose.debug.yaml`**: The override file.
    - Adds `n8n-guard` (Alpine with `iptables`).
    - Configures `n8n` to use `network_mode: service:n8n-guard`.
    - Injects `HTTP_PROXY` and `NODE_TLS_REJECT_UNAUTHORIZED` into the build.
- **`firewall.sh`**: The script running inside `n8n-guard`.
    - Sets default policy to DROP.
    - Allows DNS (53) and Private Subnets (10.x, 172.16.x, 192.168.x).
    - Logs all other NEW outbound connections.
- **`start-build-proxy.ps1`**: Helper to launch `mitmproxy`.

## ⚠️ Notes
- **SSL Verification**: To make the build proxy work, we have disabled strict SSL checks in the `Dockerfile` and `.npmrc`. Do not use this configuration for production builds where security integrity is paramount.
- **Volume Wipe**: If you encounter "Encryption Key Mismatch" errors, you may need to wipe the volumes:
    ```powershell
    docker compose -f docker-compose.yaml -f .network-debugger/docker-compose.debug.yaml down -v
    ```

---

## 🔄 Impact on Normal Workflows

### Standard `docker compose up`
**Status: Unaffected (mostly)**
- We moved the `ports` configuration to `docker-compose.override.yaml`.
- By default, `docker compose up` automatically loads both `docker-compose.yaml` and `docker-compose.override.yaml`.
- **Result:** You can run `docker compose up -d` as usual, and `n8n` will be accessible on port `56781`.

### Dev Containers
**Status: Minimal Impact**
- Dev Containers usually rely on `devcontainer.json` or their own compose files.
- If your Dev Container uses the main `docker-compose.yaml` **and** expects `n8n` to expose ports directly defined in that file, it *might* need a slight adjustment to include the override or define ports itself.
- However, since we only modified the *host* port mapping in the base file (by removing it), internal container-to-container communication usually remains fine.

### Source Code Changes
- **`Dockerfile.source`**: We added `ARG NODE_TLS_REJECT_UNAUTHORIZED` and `npm config set strict-ssl false`. These are harmless defaults that allow flexibility but do not break standard builds.
- **`.npmrc`**: We added `strict-ssl=false`. This applies globally to the repo. If you require strict SSL for compliance in other environments, you may want to revert this line before committing.
