from __future__ import annotations

import logging
import socket
import sys
import threading
from pathlib import Path

from platformdirs import user_data_dir
from werkzeug.serving import make_server

import webview
from app import create_app


log = logging.getLogger("pickme")


def find_free_port(host: str = "127.0.0.1") -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind((host, 0))
        return sock.getsockname()[1]


class FlaskServer(threading.Thread):
    def __init__(self, app, host: str, port: int) -> None:
        super().__init__(daemon=True)
        self._app = app
        self._host = host
        self._port = port
        self._server = make_server(host, port, app)
        self._ctx = app.app_context()
        self._shutdown_event = threading.Event()

    def run(self) -> None:
        self._ctx.push()
        log.info("Flask server started on http://%s:%s", self._host, self._port)
        try:
            self._server.serve_forever()
        finally:
            self._server.server_close()
            self._ctx.pop()
            self._shutdown_event.set()

    def shutdown(self) -> None:
        log.info("Stopping Flask server")
        self._server.shutdown()
        self._shutdown_event.wait(timeout=5)


def application_paths() -> tuple[Path, Path, Path]:
    base_dir = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
    project_dir = Path(__file__).resolve().parent
    package_dir = project_dir / "app"
    if base_dir != project_dir and (base_dir / "app").exists():
        package_dir = base_dir / "app"
    default_data_dir = package_dir / "data"
    user_dir = Path(user_data_dir("PickMe", "PickMe"))
    return package_dir, default_data_dir, user_dir


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    package_dir, default_data_dir, user_dir = application_paths()

    log.info("Using user data directory: %s", user_dir)

    app = create_app(user_dir, default_data_dir)
    host = "127.0.0.1"
    port = find_free_port(host)

    server = FlaskServer(app, host, port)
    server.start()

    window = webview.create_window(
        "Pick Me",
        url=f"http://{host}:{port}",
        width=1280,
        height=860,
        resizable=True,
    )

    try:
        webview.start(gui=None, http_server=False)
    finally:
        if server.is_alive():
            server.shutdown()
        server.join(timeout=5)


if __name__ == "__main__":
    main()
