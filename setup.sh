#!/bin/bash

set -e

echo " * running setup"
mount -t proc /proc
dhclient eth0
hostname raspberrypi
cd /root
rngd -r /dev/urandom
echo 1 > /proc/sys/kernel/panic

echo " * downloading tuya-convert"
curl -L https://github.com/ct-Open-Source/tuya-convert/archive/31856ada24a1e951b4da849bff2ed056f544c51b.tar.gz -o tuya-convert.tar.gz
tar xvf tuya-convert.tar.gz
rm tuya-convert.tar.gz
mv tuya-convert-* tuya-convert

echo " * configuring tuya-convert"
tuya-convert/install_prereq.sh
touch tuya-convert/scripts/eula_accepted
sed -i 's/WLAN=.*/WLAN=ap0/' tuya-convert/config.txt

echo " * disabling dnsmasq service"
rm -f /etc/systemd/system/multi-user.target.wants/dnsmasq.service

echo " * disabling hostapd service"
rm -f /etc/systemd/system/multi-user.target.wants/hostapd.service

echo " * disabling mosquitto service"
rm -f /etc/systemd/system/multi-user.target.wants/mosquitto.service

echo " * creating ap service"
cat > /lib/systemd/system/ap.service << EOF
[Unit]
Description=Add AP Interface

[Service]
Type=oneshot
ExecStart=iw dev wlan0 interface add ap0 type __ap

[Install]
WantedBy=multi-user.target
EOF
ln -s /lib/systemd/system/ap.service /etc/systemd/system/multi-user.target.wants/ap.service

echo " * creating wpa_supplicant configuration"
cat > /etc/wpa_supplicant/wpa_supplicant.conf << EOF
ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev
update_config=1

network={
    ssid="vtrust-flash"
    key_mgmt=NONE
}
EOF

echo " * disabling dhcpcd on first wifi adapter"
echo "denyinterfaces wlan0 ap0" >> /etc/dhcpcd.conf

echo " * removing setup"
rm /setup.sh

echo " * setup done"
sync
