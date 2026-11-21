#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
install -d -m 755 /opt/omnifleet-wifi
install -d -m 700 /etc/omnifleet-wifi
if [[ ! -f /etc/omnifleet-wifi/tls.crt ]]; then
  openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
    -keyout /etc/omnifleet-wifi/tls.key -out /etc/omnifleet-wifi/tls.crt \
    -subj '/CN=OmniFleet 104 Wi-Fi' \
    -addext 'subjectAltName=IP:192.168.144.108' \
    -addext 'basicConstraints=critical,CA:TRUE'
fi
chmod 600 /etc/omnifleet-wifi/tls.key
chmod 644 /etc/omnifleet-wifi/tls.crt
install -m 644 "$HERE/service.py" /opt/omnifleet-wifi/service.py
install -m 644 "$HERE/omnifleet-wifi.service" /etc/systemd/system/omnifleet-wifi.service
systemctl daemon-reload
systemctl enable --now omnifleet-wifi.service
