from __future__ import annotations

import ctypes
import logging
import os
import socket
import sys
import threading
from pathlib import Path

import uvicorn

import webview
from app import create_app
from pickme_bootstrap import application_paths


log = logging.getLogger("pickme")


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
    h = ctypes.windll.kernel32.CreateMutexW(None, True, mutex_name)
    err = ctypes.windll.kernel32.GetLastError()
    return err == 183


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
            with winreg.OpenKey(root, path) as k:
                pv, _ = winreg.QueryValueEx(k, "pv")
                if pv and pv != "0.0.0.0":
                    return True
        except FileNotFoundError:
            pass
    return False


def prompt_open_webview2_page_and_exit() -> None:
    text = "未检测到 Microsoft Edge WebView2 运行时。\n是否前往官方下载页面？\n\nWebView2 Runtime is not installed.\nOpen the official download page?"
    title = "依赖缺失 | Dependency Required"
    ret = message_box(text, title, 0x00000040 | 0x00000004 | 0x00040000)
    if ret == 6:
        url = "https://developer.microsoft.com/en-us/microsoft-edge/webview2/consumer"
        try:
            os.startfile(url)
        except Exception:
            pass
    sys.exit(0)


def main() -> None:
    logging.basicConfig(level=logging.INFO)

    if already_running():
        message_box(
            "程序已在运行。\n\nApplication is already running.",
            "提示 | Notice",
            0x00000040 | 0x00000000 | 0x00040000,
        )
        sys.exit(0)

    if not webview2_installed():
        prompt_open_webview2_page_and_exit()

    package_dir, default_data_dir, user_dir = application_paths()
    log.info("Using user data directory: %s", user_dir)

    app = create_app(user_dir, default_data_dir)
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


if __name__ == "__main__":
    main()
