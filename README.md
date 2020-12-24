[![Join us on https://gitter.im/qtoggle/community](https://badges.gitter.im/qtoggle/community.png)](https://gitter.im/qtoggle/community?utm_source=badge&utm_medium=badge&utm_content=badge)

---


## What is Tuya Convert OS?

Tuya Convert OS is a customized Raspbian OS image that runs
[Tuya Convert](https://github.com/ct-Open-Source/tuya-convert) with a friendly user interface.

This tool will help you flash custom firmware on ESP8266/ESP8285-based devices that run [Tuya](https://www.tuya.com/)
firmware. 

Check out these [screenshots](https://github.com/qtoggle/tuya-convert-os/wiki/Screenshots) if you want to see it in
action.

## Requirements

 * a Raspberry Pi 3 or 4 board (any model)
 * a micro SD card (any size above 2GB will do)
 * a wired network connection

Optionally, the presence of a secondary Wi-Fi USB adapter will fix some cases where a 3rd Wi-Fi device has to be
connected to the temporary access point.


## Getting Started

1. Download Tuya Convert OS from the [releases](https://github.com/qtoggle/tuya-convert-os/releases) page.
2. Extract the compressed image.
3. Follow [these instructions](https://www.raspberrypi.org/documentation/installation/installing-images/) to write the
OS image on your SD card.
4. Connect the Raspberry Pi to your local network, using an ethernet cable.
5. Boot your Raspberry Pi with the freshly written SD card. Find its IP address using one of the following methods (the
hostname you should be looking for is `tuya-convert`):

     * smart phone apps like Fing to scan your network
     * looking through your router's DHCP leases
     * an attached display will show the IP address
     * accessing `tuya-convert.local` may work on your local network

6. Point your favorite browser to `http://ipaddress` (`http://tuya-convert.local` may also work). You should see a
web page that will walk you through the entire conversion process.


## Troubleshooting

You can login remotely using SSH/Putty and use default Raspbian credentials (username `pi`, password `raspberry`).

The frontend is provided by a service called `tcfrontend`. It is also responsible for spawning tuya-convert scripts in
the background. You can read its log using `journactl`:

    journalctl -u tcfrontend -f


## Rebuilding Image

If you want to rebuild the OS image from scratch, you'll need to:

 * run Linux on your laptop
 * have the following commands available: `git`, `curl`, `rsync`, `zip`, `unzip`, `losetup`, `fdisk`, `qemu-system-arm` 

Then simply run:

    git clone https://github.com/qtoggle/tuya-convert-os.git
    cd tuya-convert-os
    sudo ./build.sh

At the end of a successful build, you should have a `tuya-convert-os.img` and a compressed `tuya-convert-os.zip`.
