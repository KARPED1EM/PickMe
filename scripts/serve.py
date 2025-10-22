from __future__ import annotations

import argparse
import logging
import socket
import sys
from pathlib import Path

import uvicorn

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app import create_app  # noqa: E402
from pickme.paths import application_paths  # noqa: E402

log = logging.getLogger("pickme.server")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="python -m scripts.serve",
        description="Start the PickMe FastAPI server.",
    )
    parser.add_argument("--host", default="127.0.0.1", help="Host address to bind.")
    parser.add_argument(
        "--port",
        type=int,
        default=8000,
        help="Port to bind. Use 0 to select a free port automatically.",
    )
    parser.add_argument(
        "--user-data-dir",
        type=Path,
        default=None,
        help="Directory used to store user data when using filesystem storage.",
    )
    parser.add_argument(
        "--default-data-dir",
        type=Path,
        default=None,
        help="Directory containing bundled default data (defaults to packaged assets).",
    )
    parser.add_argument(
        "--reload",
        action="store_true",
        help="Enable auto-reload (useful during development).",
    )
    parser.add_argument(
        "--log-level",
        default="info",
        help="Logging level passed to uvicorn (e.g. debug, info, warning).",
    )
    parser.add_argument(
        "--storage",
        default="browser",
        choices=["filesystem", "browser", "auto"],
        help=(
            "Persistence mode: filesystem (desktop-style local files), "
            "browser (per-client localStorage), or auto."
        ),
    )
    return parser.parse_args()


def find_free_port(host: str) -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind((host, 0))
        return sock.getsockname()[1]


def normalize_storage_mode(value: str) -> str:
    if value == "auto":
        return "browser"
    return value


def main() -> None:
    args = parse_args()

    logging.basicConfig(
        level=getattr(logging, str(args.log_level).upper(), logging.INFO)
    )

    _, default_data_dir, user_dir = application_paths()
    if args.default_data_dir:
        default_data_dir = args.default_data_dir
    if args.user_data_dir:
        user_dir = args.user_data_dir

    storage_mode = normalize_storage_mode(args.storage)
    if storage_mode == "filesystem":
        user_dir.mkdir(parents=True, exist_ok=True)

    app = create_app(user_dir, default_data_dir, storage_mode=storage_mode)

    port = args.port
    if port == 0:
        port = find_free_port(args.host)

    log.info(
        "Starting PickMe server on http://%s:%s (storage: %s, location: %s)",
        args.host,
        port,
        app.state.storage.mode,
        app.state.storage.location_hint,
    )

    uvicorn.run(
        app,
        host=args.host,
        port=port,
        log_level=args.log_level,
        reload=args.reload,
    )


if __name__ == "__main__":
    main()
