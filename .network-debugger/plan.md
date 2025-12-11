# Network Debugging & Restriction Plan

## Objective
Restrict outbound traffic from `n8n-source` to **only** essential services (Postgres, Localhost) and **log** any attempts to reach the outside world (Internet) during:
1.  **Build Time** (`docker build`)
2.  **Run Time** (`docker compose up`)

## Constraints
- **NO** changes to `n8n` source code.
- **NO** complex custom software (prefer native Docker/Windows tools).
- **YES** allowed to modify `docker-compose.yaml` (or use override files).
- **Environment**: Windows 11 Pro, Docker Desktop.

---

## Phase 1: Run Time (The "Network Guard" Pattern)

We will use Docker's **Network Namespace Sharing** capability. This allows us to attach a "firewall" sidecar to the `n8n` container without touching the `n8n` image.

### Architecture
1.  **The Guard Container (`n8n-guard`)**:
    -   **Image**: `alpine:latest` (lightweight, standard).
    -   **Privileges**: `cap_add: [NET_ADMIN]` (required to modify iptables).
    -   **Role**: It creates the network interface, owns the IP address, and runs the firewall (`iptables`).
    -   **Ports**: The web ports (`5678`) are exposed here, not on `n8n`.

2.  **The Application Container (`n8n-source`)**:
    -   **Network Mode**: `service:n8n-guard`.
    -   **Effect**: It shares the network stack of the Guard. It sees what the Guard sees. It has no separate IP.
    -   **Changes**: We remove `ports` and `networks` from this service in the compose file.

### Firewall Logic (`firewall_rules.sh`)
This script runs inside the Guard container on startup.
1.  **Log** all NEW outbound connection attempts.
2.  **Allow** Internal Docker DNS (UDP/TCP 53).
3.  **Allow** Traffic to Local Subnets (Docker internal networks: `172.16.0.0/12`, `192.168.0.0/16`, `10.0.0.0/8`). This ensures `n8n` can reach `postgres`.
4.  **Drop** everything else (Internet).

### Execution Strategy
We will create a `docker-compose.debug.yaml` file. This "Override" file allows us to layer these changes on top of your existing `docker-compose.yaml` without permanently breaking your clean setup.

**Command:**
```powershell
docker compose -f docker-compose.yaml -f .network-debugger/docker-compose.debug.yaml up
```

---

## Phase 2: Build Time (The Standalone Proxy)

Docker builds happen in ephemeral containers *before* the compose network is fully established. We cannot easily use a container defined in the same compose file as a build proxy.

### Strategy
We will run a temporary **Proxy Container** first, then tell the build process to route traffic through it.

### Steps
1.  **Start Proxy**: Run a standard `mitmproxy` (Man-in-the-Middle Proxy) container in the background.
    -   It logs all requests to stdout.
    -   It runs on the host network or exposes a port to the host.
2.  **Configure Build**: pass `HTTP_PROXY` and `HTTPS_PROXY` args to the `n8n` build config in `docker-compose.debug.yaml`.
    -   Point these to `http://host.docker.internal:8888`.

### Traffic Control
-   **Logging**: `mitmproxy` logs all URLs accessed during `npm install` / `pnpm install`.
-   **Blocking**: We can run `mitmproxy` with a simple script to block specific domains, or simply disconnect the internet from that proxy container if we want a "hard" test (though `npm install` usually requires *some* internet).

---

## Summary of Files to Create

1.  `.network-debugger/docker-compose.debug.yaml`:
    -   Defines `n8n-guard`.
    -   Updates `n8n-source` to use the guard.
    -   Adds `build.args` for the proxy.
2.  `.network-debugger/firewall.sh`:
    -   The script for `n8n-guard` to configure `iptables`.
3.  (Optional) `.network-debugger/start-build-proxy.ps1`:
    -   Helper script to start the build-time proxy.

---

## Usage Instructions

### 1. Start Build Proxy
Start the local proxy server to log/filter build-time traffic.
```powershell
.network-debugger/start-build-proxy.ps1
```
*   **Proxy Logs:** Run `docker logs -f n8n-build-proxy` to see traffic.
*   **Web UI:** Open `http://localhost:8081` to view requests visually.
    *Note: The actual proxy listens on port 1981, the web UI is on 8081.*

### 2. Build & Start Debug Environment
Build the `n8n` container (routing traffic through proxy) and start it behind the network guard.
```powershell
docker compose -f docker-compose.yaml -f .network-debugger/docker-compose.debug.yaml up -d --build
```

### 3. Monitor Runtime Traffic
The `n8n-guard` container now acts as the firewall for `n8n-source`.
*   **View Firewall Logs:**
    ```powershell
    docker logs -f n8n-guard
    ```
    *Look for `[N8N-OUTBOUND]` entries to see blocked attempts.*

### 4. Cleanup
To stop the environment and remove containers:
```powershell
docker compose -f docker-compose.yaml -f .network-debugger/docker-compose.debug.yaml down
# Stop the proxy
docker stop n8n-build-proxy
```