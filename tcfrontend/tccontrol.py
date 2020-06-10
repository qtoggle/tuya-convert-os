
import asyncio
import io
import logging
import os
import pexpect
import re
import signal

from typing import Any, Dict, Optional


logger = logging.getLogger(__name__)

_process: Optional['TCProcess'] = None

_conversion_task: Optional[asyncio.Task] = None
_conversion_details: Optional[Dict[str, Any]] = None
_conversion_error: Optional[Exception] = None
_conversion_cancelled: bool = False

_flashing_task: Optional[asyncio.Task] = None
_flashing_error: Optional[Exception] = None
_flashing_done: bool = False


class LogIO(io.TextIOBase):
    def __init__(self, prefix):
        self.prefix = prefix

    def write(self, b: bytes) -> int:
        s = b.decode()
        for line in s.split('\n'):
            line = re.sub(r'[\x00-\x1f]', '', line)
            if line:
                logger.debug('%s %s', self.prefix, line)

        return len(b)


class TCProcess(pexpect.spawn):
    TUYA_CONVERT_DIR = '/root/tuya-convert'
    BACKUPS_DIR = os.path.join(TUYA_CONVERT_DIR, 'backups')
    CUSTOM_FIRMWARE_FILE = os.path.join(TUYA_CONVERT_DIR, 'files', '_custom.bin')
    CMD = os.path.join(TUYA_CONVERT_DIR, 'start_flash.sh')
    CONVERT_TIMEOUT = 300
    DEFAULT_EXPECT_TIMEOUT = 2
    MAGIC = b'\xE9'

    def __init__(self) -> None:
        self._original_firmware = None
        self._chip_id = None
        self._mac = None
        self._flash_mode = None
        self._flash_freq = None
        self._flash_size = None
        self._flash_chip_id = None

        self._conversion_ready = False
        self._flashing_ready = False

        logger.debug('starting tuya-convert process')

        # Create a dummy custom firmware file placeholder; tuya-convert will pick it up as first option
        with open(self.CUSTOM_FIRMWARE_FILE, 'wb') as f:
            f.write(self.MAGIC * 300 * 1024)

        super().__init__(self.CMD, cwd=self.TUYA_CONVERT_DIR)

        self.logfile_read = LogIO('<<<')
        self.logfile_send = LogIO('>>>')

    def is_running(self) -> bool:
        return self.isalive()

    async def stop(self) -> None:
        logger.debug('stopping tuya-convert process')

        if self.isalive():
            self.kill(signal.SIGTERM)

        # Allow process to gracefully stop
        await asyncio.sleep(1)

        if self.isalive():
            self.kill(signal.SIGKILL)

        os.system('ps aux | grep hostapd | grep -v grep | tr -s ' ' | cut -d ' ' -f 2 | xargs -r kill -9')
        os.system('ps aux | grep smarthack | grep -v grep | tr -s ' ' | cut -d ' ' -f 2 | xargs -r kill -9')
        os.system('ps aux | grep mosquitto | grep -v grep | tr -s ' ' | cut -d ' ' -f 2 | xargs -r kill -9')
        os.system('ps aux | grep dnsmasq | grep -v grep | tr -s ' ' | cut -d ' ' -f 2 | xargs -r kill -9')

    async def run_conversion(self):
        await self._run_until_press_enter()
        logger.debug('smart config pairing procedure started')

        self._original_firmware = await self._run_until_original_firmware()
        logger.debug('got original firmware')

        self._chip_id = await self._run_until_chip_id()
        logger.debug('got chip id: %s', self._chip_id)

        self._mac = await self._run_until_mac()
        logger.debug('got mac: %s', self._mac)

        flash_details = await self._run_until_flash_mode()
        logger.debug('got flash details')

        self._flash_chip_id = await self._run_until_flash_chip_id()
        logger.debug('got flash chip id: %s', self._flash_chip_id)

        self._flash_mode = flash_details['flash_mode']
        logger.debug('got flash mode: %s', self._flash_mode)

        self._flash_freq = flash_details['flash_freq']
        logger.debug('got flash freq: %s', self._flash_freq)

        self._flash_size = flash_details['flash_size']
        logger.debug('got flash size: %s', self._flash_size)

        await self._run_until_ready_to_flash()

        self._conversion_ready = True

    def is_conversion_ready(self) -> bool:
        return self._conversion_ready

    def get_conversion_details(self) -> Optional[Dict[str, Any]]:
        if not self._conversion_ready:
            return None

        return {
            'original_firmware': self._original_firmware,
            'chip_id': self._chip_id,
            'mac': self._mac,
            'flash_mode': self._flash_mode,
            'flash_freq': self._flash_freq,
            'flash_size': self._flash_size,
            'flash_chip_id': self._flash_chip_id
        }

    async def _run_until_press_enter(self) -> None:
        await self.expect(r'Press [^\s]+ to continue', timeout=10, async_=True)
        self.sendline()

    async def _run_until_original_firmware(self) -> bytes:
        await self.expect(r"curl: Saved to filename '([a-zA-Z0-9-]+.bin)'", timeout=self.CONVERT_TIMEOUT, async_=True)
        filename = self.match.group(1).decode()

        # Look through backups/*/*.bin for original firmware file; use most recent backup
        dirs = [os.path.join(self.BACKUPS_DIR, d) for d in os.listdir(self.BACKUPS_DIR)]
        dirs.sort(key=lambda d: os.stat(d).st_mtime, reverse=True)

        for d in dirs:
            path = os.path.join(d, filename)
            if os.path.isfile(path):
                with open(path, 'rb') as f:
                    return f.read()

        raise Exception('Could not find original firmware file')

    async def _run_until_chip_id(self) -> str:
        await self.expect(r"ChipID: (.*?)\n", timeout=self.DEFAULT_EXPECT_TIMEOUT, async_=True)
        return self.match.group(1).decode()

    async def _run_until_mac(self) -> str:
        await self.expect(r"MAC: ([a-fA-F0-9:]+)", timeout=self.DEFAULT_EXPECT_TIMEOUT, async_=True)
        return self.match.group(1).decode()

    async def _run_until_flash_mode(self) -> Dict[str, Any]:
        await self.expect(r"FlashMode: (\d+)M ([A-Z]+) @ (\d+)MHz", timeout=self.DEFAULT_EXPECT_TIMEOUT, async_=True)
        return {
            'flash_size': int(self.match.group(1)),
            'flash_mode': self.match.group(2).decode(),
            'flash_freq': int(self.match.group(3))
        }

    async def _run_until_flash_chip_id(self) -> str:
        await self.expect(r"FlashChipId: (\d+)", timeout=self.DEFAULT_EXPECT_TIMEOUT, async_=True)
        return self.match.group(1).decode()

    async def _run_until_ready_to_flash(self) -> None:
        await self.expect('Ready to flash third party firmware!', timeout=self.DEFAULT_EXPECT_TIMEOUT, async_=True)
        await self.expect(r'Please select 0-\d:\s*', timeout=self.DEFAULT_EXPECT_TIMEOUT, async_=True)

    def write_firmware(self, firmware: bytes) -> None:
        logger.debug('writing %s bytes to firmware file %s', len(firmware), self.CUSTOM_FIRMWARE_FILE)

        with open(self.CUSTOM_FIRMWARE_FILE, 'wb') as f:
            f.write(firmware)

    async def run_flashing(self):
        await self._run_until_point_of_no_return()
        await self._run_until_flashed_successfully()

        self._flashing_ready = True

    def is_flashing_ready(self) -> bool:
        return self._flashing_ready

    async def _run_until_point_of_no_return(self) -> None:
        self.send('1')
        await self.expect(
            r'This is the point of no return \[y/N\]\s+',
            timeout=self.DEFAULT_EXPECT_TIMEOUT,
            async_=True
        )
        self.send('y')

    async def _run_until_flashed_successfully(self) -> None:
        await self.expect(r'successfully in \d+ms, rebooting\.\.\.', timeout=30, async_=True)


async def _conversion_task_func():
    global _process
    global _conversion_task
    global _conversion_error
    global _conversion_details
    global _flashing_error
    global _flashing_done

    assert _process is not None
    _conversion_error = None
    _conversion_details = None
    _flashing_done = False
    _flashing_error = None

    try:
        await _process.run_conversion()

    except asyncio.CancelledError:
        logger.info('conversion task cancelled')
        if _process:
            await _process.stop()
            _process = None

    except Exception as e:
        logger.error('conversion task failed', exc_info=True)
        _conversion_error = e
        if _process:
            await _process.stop()
            _process = None

    else:
        logger.info('conversion task ended', exc_info=True)
        _conversion_details = _process.get_conversion_details()

    _conversion_task = None


async def _restart_conversion():
    global _process
    global _conversion_task
    global _conversion_cancelled

    if _conversion_task:
        _conversion_task.cancel()
        await _conversion_task

    if _process:
        await _process.stop()
        _process = None

    start_conversion()


def start_conversion() -> None:
    global _process
    global _conversion_task
    global _conversion_cancelled

    logger.info('starting conversion')

    assert _process is None
    assert _conversion_task is None

    _process = TCProcess()
    _conversion_cancelled = False
    _conversion_task = asyncio.create_task(_conversion_task_func())


def restart_conversion() -> None:
    asyncio.create_task(_restart_conversion())


def cancel_conversion() -> None:
    global _process
    global _conversion_task
    global _conversion_error
    global _conversion_details
    global _conversion_cancelled

    logger.info('cancelling conversion')

    assert _process is not None
    assert _conversion_task is not None

    _conversion_task.cancel()
    asyncio.create_task(_process.stop())

    _conversion_task = None
    _conversion_error = None
    _conversion_details = None
    _conversion_cancelled = True
    _process = None


def clear_conversion() -> None:
    global _process
    global _conversion_task
    global _conversion_error
    global _conversion_details
    global _conversion_cancelled

    logger.info('clearing conversion')

    asyncio.create_task(_process.stop())

    assert _process is not None
    assert _conversion_task is None

    _conversion_error = None
    _conversion_details = None
    _conversion_cancelled = True
    _process = None


def is_converting() -> bool:
    return _conversion_task is not None


def is_conversion_cancelled() -> bool:
    return _conversion_cancelled


def get_conversion_error() -> Optional[Exception]:
    return _conversion_error


def get_conversion_details() -> Optional[Dict[str, Any]]:
    return _conversion_details


async def _flashing_task_func():
    global _process
    global _flashing_task
    global _flashing_error
    global _flashing_done
    global _conversion_details

    assert _process is not None
    assert _process.is_conversion_ready()
    _flashing_error = None
    _flashing_done = False

    try:
        await _process.run_flashing()

    except Exception as e:
        logger.error('flashing task failed', exc_info=True)
        _flashing_error = e
        if _process:
            await _process.stop()
            _process = None

    else:
        logger.info('flashing task ended', exc_info=True)
        _conversion_details = None
        _flashing_done = True
        if _process:
            await _process.stop()
            _process = None

    _flashing_task = None


def start_flash(firmware: bytes) -> None:
    global _flashing_task

    logger.info('starting flash')

    assert _process is not None
    assert _flashing_task is None

    _process.write_firmware(firmware)

    _flashing_task = asyncio.create_task(_flashing_task_func())


def is_flashing() -> bool:
    return _flashing_task is not None


def get_flashing_error() -> Optional[Exception]:
    return _flashing_error


def is_flashing_done() -> bool:
    return _flashing_done
