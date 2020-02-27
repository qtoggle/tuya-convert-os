
import asyncio
import logging

from tcfrontend import webserver
from tcfrontend import states


logger = None


async def init():
    states.init()


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
    app.listen(8888)

    asyncio.get_event_loop().create_task(init())
    asyncio.get_event_loop().run_forever()


if __name__ == '__main__':
    main()
