
import os
import logging

from typing import List

from tornado.escape import json_decode
from tornado.httpclient import AsyncHTTPClient, HTTPClientError
from tornado.web import Application, RequestHandler, HTTPError

from tcfrontend import states


logger = logging.getLogger(__name__)


class MainPageHandler(RequestHandler):
    def get(self) -> None:
        self.render('main.html')


class JSONRequestHandlerMixin:
    json = None
    request = None

    def prepare(self):
        if self.request.headers['Content-Type'] == 'application/json':
            self.json = json_decode(self.request.body)


class StatusHandler(RequestHandler, JSONRequestHandlerMixin):
    def get(self) -> None:
        self.finish({
            'state': states.get_state(),
            'params': states.get_state_params()
        })

    def patch(self) -> None:
        if self.json is None:
            raise HTTPError(400, 'expected JSON in request body')

        state = self.json.get('state')
        if state not in states.STATES:
            raise HTTPError(400, f'invalid state {state}')

        params = self.json.get('params', {})

        # TODO: preprocess params

        try:
            states.set_state(state, **params)

        except states.InvalidExternalTransition:
            raise HTTPError(400, f'invalid transition')


class FirmwareOriginalHandler(RequestHandler):
    def get(self) -> None:
        self.finish()


class FirmwareProxyHandler(RequestHandler):
    async def get(self) -> None:
        http_client = AsyncHTTPClient()
        url = self.get_argument('url')
        logger.debug('proxy downloading firmware file at %s', url)

        try:
            response = await http_client.fetch(url)

        except HTTPClientError as e:
            logger.error('failed to download file at %s', url, exc_info=True)

            raise HTTPError(status_code=e.code)

        except Exception:
            logger.error('failed to download file at %s', url, exc_info=True)

            raise

        else:
            self.set_header('Content-Type', 'application/octet-stream')
            self.set_header('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0')
            await self.finish(response.body)


def make_handlers() -> List[tuple]:
    return [
        (r'/', MainPageHandler),
        (r'/state', StatusHandler),
        (r'/firmware/original.bin', FirmwareOriginalHandler),
        (r'/firmware/proxy', FirmwareProxyHandler)
    ]


def make_app() -> Application:
    return Application(
        handlers=make_handlers(),
        template_path=os.path.join(os.path.dirname(__file__), 'templates'),
        static_path=os.path.join(os.path.dirname(__file__), 'static'),
        debug=False
    )
