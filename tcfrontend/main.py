
import asyncio
import fcntl
import logging
import socket
import struct

from tornado import httpserver

from tcfrontend import webserver
from tcfrontend import states


IFNAMES = ['eth0', 'wlan0']
PORT = 80

logger = None


async def init():
    states.init()


def get_ip_address(ifname):
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    return socket.inet_ntoa(
        fcntl.ioctl(
            s.fileno(),
            0x8915,  # SIOCGIFADDR
            struct.pack('256s', ifname[:15].encode())
        )[20:24]
    )


def main() -> None:
    global logger

    logging.basicConfig(
        format='%(asctime)s: %(levelname)7s: [%(name)s] %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S',
        level=logging.DEBUG
    )

    logging.getLogger('tornado').setLevel(logging.WARNING)

    logger = logging.getLogger('tcfrontend')
    logger.info('hello!')

    app = webserver.make_app()

    for ifname in IFNAMES:
        try:
            address = get_ip_address(ifname)

        except IOError:
            continue

        server = httpserver.HTTPServer(app)
        server.listen(PORT, address=address)

    asyncio.get_event_loop().create_task(init())
    asyncio.get_event_loop().run_forever()


if __name__ == '__main__':
    main()
