
import os

from typing import List

from tornado.escape import json_decode
from tornado.web import Application, RequestHandler, HTTPError

from tcfrontend import states


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


def make_handlers() -> List[tuple]:
    return [
        (r'/', MainPageHandler),
        (r'/state', StatusHandler)
    ]


def make_app() -> Application:
    return Application(
        handlers=make_handlers(),
        template_path=os.path.join(os.path.dirname(__file__), 'templates'),
        static_path=os.path.join(os.path.dirname(__file__), 'static'),
        debug=False
    )
