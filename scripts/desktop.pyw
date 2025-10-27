from __future__ import annotations

import ctypes
import datetime
import logging
import os
import socket
import sys
import threading
from pathlib import Path

import uvicorn
import webview

APP_RUN_MODE = "desktop"
DEFAULT_APP_DATA_DIR = Path.home() / ".pickme"
PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app import create_app

log = logging.getLogger("pickme.desktop")

ALREADY_RUNNING_MESSAGE = "程序已经在运行。\n\nApplication is already running."
ALREADY_RUNNING_TITLE = "提示 | Notice"
WEBVIEW_MISSING_MESSAGE = (
    "未检测到 Microsoft Edge WebView2 运行时。\n"
    "是否打开官方下载页面？\n\n"
    "WebView2 Runtime is not installed.\n"
    "Open the official download page?"
)
WEBVIEW_MISSING_TITLE = "依赖缺失 | Dependency Required"


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
        self._server.install_signal_handlers = False  # type: ignore
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
        WEBVIEW_MISSING_MESSAGE,
        WEBVIEW_MISSING_TITLE,
        0x00000040 | 0x00000004 | 0x00040000,
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
        message_box(
            ALREADY_RUNNING_MESSAGE, ALREADY_RUNNING_TITLE, 0x00000040 | 0x00040000
        )
        sys.exit(0)

    if not webview2_installed():
        prompt_open_webview2_page_and_exit()

    app = create_app(DEFAULT_APP_DATA_DIR, APP_RUN_MODE)
    host = "127.0.0.1"
    port = find_free_port(host)

    server = AppServer(app, host, port)
    server.start()

    api = DesktopApi(DEFAULT_APP_DATA_DIR)

    window = webview.create_window(
        "Pick Me",
        url=f"http://{host}:{port}",
        width=1280,
        height=860,
        min_size=(360, 650),
        resizable=True,
        js_api=api,
    )

    api.set_window(window)

    try:
        webview.start(gui="edgechromium", http_server=False)
    finally:
        if server.is_alive():
            server.shutdown()
        server.join(timeout=5)
        if window:
            del window


class DesktopApi:
    def __init__(self, user_dir: Path):
        self.user_dir = Path(user_dir)
        self._window = None

    def set_window(self, window):
        self._window = window

    def save_export(self, data: str, suggested_filename: str | None = None):
        try:
            if not suggested_filename:
                suggested_filename = f"pickme-data-{datetime.datetime.now().strftime('%Y%m%d-%H%M%S')}.json"

            if self._window is None:
                return {"ok": False, "message": "窗口未就绪"}

            result = self._window.create_file_dialog(
                webview.SAVE_DIALOG,
                directory=str(self.user_dir),
                save_filename=suggested_filename,
                file_types=("JSON files (*.json)", "All files (*.*)"),
            )
            if not result:
                return {"ok": False, "message": "已取消保存"}

            path = result[0] if isinstance(result, (list, tuple)) else result

            with open(path, "w", encoding="utf-8") as f:
                f.write(data)

            return {"ok": True, "path": str(path)}
        except Exception as e:
            return {"ok": False, "message": str(e)}


if __name__ == "__main__":
    main()
