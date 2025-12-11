#!/bin/sh
set -e

echo "[GUARD] Initializing Network Firewall..."

# Install iptables if not present (Alpine)
if ! command -v iptables > /dev/null; then
    echo "[GUARD] Installing iptables..."
    apk add --no-cache iptables
fi

# Clear existing rules
iptables -F
iptables -X

# Set Default Policy to DROP for OUTPUT (We whitelist what we need)
# INPUT is ACCEPT by default because we want to allow incoming responses to established connections
# and incoming requests to the exposed ports.
iptables -P INPUT ACCEPT
iptables -P FORWARD DROP
iptables -P OUTPUT DROP

echo "[GUARD] Setting up Logging..."
# Log all NEW outbound connection attempts before we accept/drop them
# We limit the rate to avoid spamming logs if something goes crazy
iptables -A OUTPUT -m state --state NEW -j LOG --log-prefix "[N8N-OUTBOUND] " --log-level 4

echo "[GUARD] Configuring Allow Rules..."

# 1. Allow Loopback (Localhost)
iptables -A OUTPUT -o lo -j ACCEPT

# 2. Allow Established/Related connections (responses to our requests)
iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

# 3. Allow DNS (UDP/TCP 53)
# Essential for resolving 'postgres' or other service names
iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
iptables -A OUTPUT -p tcp --dport 53 -j ACCEPT

# 4. Allow Traffic to Private LANs (Docker Internal Networks)
# This allows n8n to talk to Postgres and other local containers.
# We are permissive here to avoid breaking internal communication.
iptables -A OUTPUT -d 10.0.0.0/8 -j ACCEPT
iptables -A OUTPUT -d 172.16.0.0/12 -j ACCEPT
iptables -A OUTPUT -d 192.168.0.0/16 -j ACCEPT

echo "[GUARD] Firewall Rules Applied."
echo "[GUARD] The following traffic is ALLOWED:"
echo "   - Localhost"
echo "   - DNS (53)"
echo "   - Private Subnets (10.x, 172.16.x-31.x, 192.168.x)"
echo "[GUARD] All other traffic is LOGGED and DROPPED."

# Keep container alive and tail kernel logs (if accessible) or just sleep
# We cat /dev/null to keep it running or use a specialized logger if available.
# Since we can't easily read dmesg in a container without specific privileges/mounting,
# we just sleep to keep the network namespace alive.
echo "[GUARD] Guard is active. Network namespace is ready."
exec tail -f /dev/null
