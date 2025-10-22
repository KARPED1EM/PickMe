from __future__ import annotations

import ctypes
import logging
import os
import socket
import sys
import threading

import uvicorn
import webview

from app import create_app
from pickme.paths import application_paths

log = logging.getLogger("pickme.desktop")

ALREADY_RUNNING_MESSAGE = (
    "\u7a0b\u5e8f\u5df2\u7ecf\u5728\u8fd0\u884c\u3002\n\nApplication is already running."
)
ALREADY_RUNNING_TITLE = "\u63d0\u793a | Notice"
WEBVIEW_MISSING_MESSAGE = (
    "\u672a\u68c0\u6d4b\u5230 Microsoft Edge WebView2 \u8fd0\u884c\u65f6\n"
    "\u662f\u5426\u6253\u5f00\u5b98\u65b9\u4e0b\u8f7d\u9875\u9762\uff1f\n\n"
    "WebView2 Runtime is not installed.\n"
    "Open the official download page?"
)
WEBVIEW_MISSING_TITLE = "\u4f9d\u8d56\u7f3a\u5931 | Dependency Required"


def find_free_port(host: str = "127.0.0.1") -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind((host, 0))
        return sock.getsockname()[1]


class AppServer(threading.Thread):
    def __init__(self, app, host: str, port: int) -> None:
        super().__init__(daemon=True)
        self._host = host
        self._port = port
        self._config = uvicorn.Config(
            app,
            host=host,
            port=port,
            log_level="info",
            access_log=False,
        )
        self._server = uvicorn.Server(self._config)
        self._server.install_signal_handlers = False
        self._shutdown_event = threading.Event()

    def run(self) -> None:
        try:
            log.info("FastAPI server started on http://%s:%s", self._host, self._port)
            self._server.run()
        finally:
            self._shutdown_event.set()

    def shutdown(self) -> None:
        log.info("Stopping FastAPI server")
        self._server.should_exit = True
        self._shutdown_event.wait(timeout=5)


def message_box(text: str, title: str, flags: int = 0x00000040 | 0x00000000) -> int:
    return ctypes.windll.user32.MessageBoxW(None, text, title, flags)


def already_running(mutex_name: str = "Global\\PickMeMutex") -> bool:
    ctypes.windll.kernel32.SetLastError(0)
    handle = ctypes.windll.kernel32.CreateMutexW(None, True, mutex_name)
    err = ctypes.windll.kernel32.GetLastError()
    return handle and err == 183


def webview2_installed() -> bool:
    import winreg

    keys = [
        (
            winreg.HKEY_LOCAL_MACHINE,
            r"SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
        ),
        (
            winreg.HKEY_LOCAL_MACHINE,
            r"SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
        ),
        (
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
        ),
    ]
    for root, path in keys:
        try:
            with winreg.OpenKey(root, path) as key:
                pv, _ = winreg.QueryValueEx(key, "pv")
                if pv and pv != "0.0.0.0":
                    return True
        except FileNotFoundError:
            continue
    return False


def prompt_open_webview2_page_and_exit() -> None:
    ret = message_box(
        WEBVIEW_MISSING_MESSAGE, WEBVIEW_MISSING_TITLE, 0x00000040 | 0x00000004 | 0x00040000
    )
    if ret == 6:
        url = "https://developer.microsoft.com/en-us/microsoft-edge/webview2/consumer"
        try:
            os.startfile(url)
        except OSError:
            log.exception("Failed to open WebView2 runtime download page")
    sys.exit(0)


def main() -> None:
    logging.basicConfig(level=logging.INFO)

    if already_running():
        message_box(ALREADY_RUNNING_MESSAGE, ALREADY_RUNNING_TITLE, 0x00000040 | 0x00040000)
        sys.exit(0)

    if not webview2_installed():
        prompt_open_webview2_page_and_exit()

    package_dir, default_data_dir, user_dir = application_paths()
    log.info("Using user data directory: %s", user_dir)

    app = create_app(user_dir, default_data_dir, storage_mode="filesystem")
    host = "127.0.0.1"
    port = find_free_port(host)

    server = AppServer(app, host, port)
    server.start()

    window = webview.create_window(
        "Pick Me",
        url=f"http://{host}:{port}",
        width=1280,
        height=860,
        resizable=True,
    )

    try:
        webview.start(gui="edgechromium", http_server=False)
    finally:
        if server.is_alive():
            server.shutdown()
        server.join(timeout=5)
        if window:
            del window


if __name__ == "__main__":
    main()
