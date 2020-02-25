
import logging

from tornado import ioloop

from tcfrontend.webserver import make_app


logger = None


def main() -> None:
    global logger

    logging.basicConfig(
        format='%(asctime)s: %(levelname)7s: [%(name)s] %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S',
        level=logging.DEBUG
    )

    logger = logging.getLogger('tcfrontend')
    logger.info('hello!')

    app = make_app()
    app.listen(8888)
    ioloop.IOLoop.current().start()


if __name__ == '__main__':
    main()
