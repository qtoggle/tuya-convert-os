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
latest_tuya-convert="$(curl --silent --head https://github.com/ct-Open-Source/tuya-convert/releases/latest | grep "^location:" | awk -F '/tag/' '{print $2}')"
curl -L https://github.com/ct-Open-Source/tuya-convert/archive/${latest_tuya-convert}.tar.gz -o tuya-convert.tar.gz
tar xvf tuya-convert.tar.gz
rm tuya-convert.tar.gz
mv tuya-convert-* tuya-convert

echo " * configuring tuya-convert"
tuya-convert/install_prereq.sh
touch tuya-convert/scripts/eula_accepted
# Use ap0 so wlan0 can be used to connect to user's wifi
sed -i 's/WLAN=.*/WLAN=ap0/' tuya-convert/config.txt
# Always use flash params that come with supplied firmware
sed -i 's,files/$selection,files/$selection\&override=yes,' tuya-convert/scripts/firmware_picker.sh
# We run tcfrontend on port 80, but different IP
sed -i 's/check_port tcp 80.*//' tuya-convert/scripts/setup_checks.sh
# Don't attempt to kill wpa_supplicant - it doesn't interfere with tuya-convert
sed -i 's/pidof wpa_supplicant/pidof wpa_supplicant_nevermind/' tuya-convert/scripts/setup_ap.sh
# Make firmware backup optional
cat tuya-convert/start_flash.sh | tr '\n' '\f' | sed -r 's,(echo "Fetching.*\sfi\s),if ! test -f ../_skip_backup; then\n\1else\npushd . >/dev/null\nfi,g' | tr '\f' '\n' > tuya-convert/start_flash.sh.bak
mv tuya-convert/start_flash.sh.bak tuya-convert/start_flash.sh
chmod +x tuya-convert/start_flash.sh
sed -ri 's/read -p "Do you want to continue anyway.*//' tuya-convert/start_flash.sh

echo " * installing pexpect python package"
pip3 install pexpect==4.8.0

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
ExecStartPre=rfkill unblock wlan
ExecStart=iw dev wlan0 interface add ap0 type __ap

[Install]
WantedBy=multi-user.target
EOF
ln -s /lib/systemd/system/ap.service /etc/systemd/system/multi-user.target.wants/ap.service

echo " * creating tcfrontend service"
cat > /lib/systemd/system/tcfrontend.service << EOF
[Unit]
Description=Tuya-Convert Frontend
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
ExecStart=/root/tcfrontend/tcfrontend.sh

[Install]
WantedBy=multi-user.target
EOF
ln -s /lib/systemd/system/tcfrontend.service /etc/systemd/system/multi-user.target.wants/tcfrontend.service

echo " * creating wpa_supplicant configuration for vtrust-flash"
cat > /etc/wpa_supplicant/wpa_supplicant-wlan1.conf << EOF
ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev
update_config=1
network={
    ssid="vtrust-flash"
    key_mgmt=NONE
}
EOF

echo " * disabling dhcpcd on AP wifi adapter"
echo "denyinterfaces ap0" >> /etc/dhcpcd.conf

echo " * removing setup"
rm /setup.sh

echo " * changing hostname"
sed -i 's/raspberrypi/tuya-convert/' /etc/hostname /etc/hosts

echo " * setup done"
sync
