
import asyncio
import base64
import logging

from typing import Any, Dict

from tcfrontend import tccontrol


STATE_READY = 'ready'
STATE_CONVERTING = 'converting'
STATE_CONVERTED = 'converted'
STATE_CONVERSION_CANCELLED = 'conversion-cancelled'
STATE_CONVERSION_ERROR = 'conversion-error'
STATE_FLASHING = 'flashing'
STATE_FLASHING_ERROR = 'flashing-error'
STATE_FLASHED = 'flashed'

STATES = {
    STATE_READY,
    STATE_CONVERTING,
    STATE_CONVERTED,
    STATE_CONVERSION_CANCELLED,
    STATE_CONVERSION_ERROR,
    STATE_FLASHING,
    STATE_FLASHING_ERROR
}

TRANSITION_REQUEST_FUNCS = {
    (STATE_READY, STATE_CONVERTING): tccontrol.start_conversion,  # Start Conversion
    (STATE_CONVERTING, STATE_READY): tccontrol.cancel_conversion,  # Cancel Conversion
    (STATE_CONVERSION_CANCELLED, STATE_CONVERTING): tccontrol.start_conversion,  # Restart Conversion
    (STATE_CONVERTED, STATE_CONVERTING): tccontrol.start_conversion,  # Convert Another Device
    (STATE_CONVERSION_ERROR, STATE_CONVERTING): tccontrol.start_conversion,  # Retry
    (STATE_CONVERTED, STATE_FLASHING): tccontrol.start_flash,  # Flash
    (STATE_FLASHING_ERROR, STATE_FLASHING): tccontrol.start_flash,  # Retry
    (STATE_FLASHING_ERROR, STATE_CONVERTING): tccontrol.start_conversion,  # Convert Another Device
    (STATE_FLASHED, STATE_CONVERTING): tccontrol.start_conversion,  # Convert Another Device
}

STATE_GET_PARAM_FUNCS = {
    STATE_CONVERTED: lambda: {k: v for k, v in tccontrol.get_conversion_details().items() if k != 'original_firmware'}
}

STATE_PREPROCESS_PARAM_FUNCS = {
    STATE_FLASHING: lambda params: {
        k: v if k != 'firmware' else base64.urlsafe_b64decode(v)
        for k, v in params
    }
}

UPDATE_INTERVAL = 1
UPDATE_INTERVAL_ERROR = 5


logger = logging.getLogger(__name__)

_state: str = STATE_READY
_update_task: asyncio.Task


class TransitionException(Exception):
    pass


class InvalidTransitionRequest(TransitionException):
    def __init__(self, old_state: str, new_state: str) -> None:
        self.old_state: str = old_state
        self.new_state: str = new_state

        super().__init__(f'Invalid transition request: ${old_state} -> ${new_state}')


def check_transition():
    global _state

    if tccontrol.is_flashing():
        new_state = STATE_FLASHING

    elif tccontrol.is_converting():
        new_state = STATE_CONVERTING

    elif tccontrol.has_flash_error():
        new_state = STATE_FLASHING_ERROR

    elif tccontrol.has_conversion_error():
        new_state = STATE_CONVERSION_ERROR

    elif tccontrol.has_conversion_details():
        new_state = STATE_CONVERTED

    else:
        new_state = STATE_READY

    logger.debug('transition %s -> %s', _state, new_state)
    _state = new_state


async def update_loop():
    while True:
        try:
            check_transition()

        except Exception:
            logger.error('transition check failed', exc_info=True)
            interval = UPDATE_INTERVAL_ERROR

        else:
            interval = UPDATE_INTERVAL

        try:
            await asyncio.sleep(interval)

        except asyncio.CancelledError:
            logger.debug('update task cancelled')
            break


def get_state() -> str:
    return _state


def get_state_params() -> Dict[str, Any]:
    func = STATE_GET_PARAM_FUNCS.get(_state)
    if not func:
        return {}

    return func()


async def handle_transition_request(old_state: str, new_state: str, **params: Any) -> None:
    func = TRANSITION_REQUEST_FUNCS[(old_state, new_state)]
    func(**params)


async def request_state(new_state: str, **params: Any) -> None:
    global _state

    if new_state == _state:
        return

    logger.debug('requesting transition %s -> %s', _state, new_state)

    if (_state, new_state) not in TRANSITION_REQUEST_FUNCS:
        raise InvalidTransitionRequest(_state, new_state)

    func = STATE_PREPROCESS_PARAM_FUNCS.get(new_state)
    if func:
        params = func(params)

    try:
        await handle_transition_request(_state, new_state, **params)

    except Exception as e:
        logger.error('requested transition %s -> %s failed', _state, new_state, exc_info=True)

        raise TransitionException('Requested transition failed') from e


def init() -> None:
    global _update_task

    _update_task = asyncio.create_task(update_loop())
