#!/bin/bash

if [[ $(id -u) -ne 0 ]]; then echo "please run as root"; exit 1; fi

WORK_DIR=$(dirname $0)
cd ${WORK_DIR}

set -e

echo " * downloading kernel"
#curl -L https://github.com/dhruvvyas90/qemu-rpi-kernel/raw/ec66c012f7cf2eaf936de1240ef81e1b20310d05/kernel-qemu-4.19.50-buster -o kernel.img
#curl -L https://github.com/dhruvvyas90/qemu-rpi-kernel/raw/ec66c012f7cf2eaf936de1240ef81e1b20310d05/versatile-pb.dtb -o versatile-pb.dtb
    
echo " * downloading raspbian image"
#curl https://downloads.raspberrypi.org/raspbian_lite/images/raspbian_lite-2020-02-14/2020-02-13-raspbian-buster-lite.zip -o raspbian-lite.zip
    
echo " * extracting raspbian image"
#unzip raspbian-lite.zip
#mv *raspbian*lite.img raspbian-lite.img

echo " * mounting raspbian root image"
#boot_offs=$(fdisk -l raspbian-lite.img | grep raspbian-lite.img1 | tr -s ' ' | cut -d ' ' -f 2)
#root_offs=$(fdisk -l raspbian-lite.img | grep raspbian-lite.img2 | tr -s ' ' | cut -d ' ' -f 2)
loop_dev=$(losetup -P -f --show raspbian-lite.img)
mkdir -p boot
mkdir -p root
mount ${loop_dev}p1 boot
mount ${loop_dev}p2 root

echo " * copying setup.sh"
cp setup.sh root
chmod +x root/setup.sh

echo " * enabling ssh"
touch boot/ssh

echo " * unmounting raspbian root image"
sync
sleep 2
umount root
umount boot
losetup -d ${loop_dev}

echo " * starting qemu"
qemu-system-arm \
    -kernel kernel.img \
    -dtb versatile-pb.dtb \
    -append "root=/dev/sda2 panic=10 quiet rootfstype=ext4 rw init=/setup.sh" \
    -hda raspbian-lite.img \
    -cpu arm1176 \
    -m 256 \
    -M versatilepb \
    -net nic -net user \
    -no-reboot \
    -nographic
sync

echo " * compressing tuya-convert-os image"
#cp raspbian-lite.img tuya-convert-os.img
#zip tuya-convert-os.zip tuya-convert-os.img

#echo " * tuya-convert-os.zip is ready"
