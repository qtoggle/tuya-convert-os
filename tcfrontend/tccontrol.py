
import logging

from typing import Any, Dict


logger = logging.getLogger(__name__)


def start_conversion() -> None:
    logger.debug('starting conversion')


def cancel_conversion() -> None:
    logger.debug('cancelling conversion')


def is_converting() -> bool:
    return False


def has_conversion_error() -> bool:
    return False


def has_conversion_details() -> bool:
    return False


def get_conversion_details() -> Dict[str, Any]:
    return {
        'flash_size': 4 * 1024 * 1024,
        'flash_freq': 40,
        'flash_mode': 'QIO',
        'original_firmware': b'deadbeef'
    }


def start_flash(firmware: bytes) -> None:
    logger.debug('starting flash')


def is_flashing() -> bool:
    return False


def has_flash_error() -> bool:
    return False
