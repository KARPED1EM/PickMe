# PickMe

English | [中文](README_zh.md)

PickMe is a random name picker tool built with FastAPI and modern web frontend. It can run as a desktop application (using WebView2) or in server mode.

## Features

- 🎯 **Random Selection**: Pick individual students or groups with configurable cooldown periods to avoid frequent repetitions
- 🗂️ **Classroom Management**: Create, switch, and delete classrooms with complete data isolation and drag-to-reorder support
- 💾 **Unified Persistence**: Desktop mode writes a single JSON file per user; server mode keeps per-visitor UUID JSON files under the server data directory while the browser only caches the latest payload
- 🪄 **User-Friendly Interface**: Context menus, cooldown queue, pick history, and more for easy interaction

## Platform Support

**Official Support**: Windows (x86, x64, ARM64)

> **Note**: This application officially targets Windows across multiple architectures. Linux and macOS have not been adapted, and compatibility is unknown.

## Running the Application

### 1. Desktop Mode (WebView2)

```bash
python scripts/desktop.pyw
```

On first launch, data files will be created in `%LOCALAPPDATA%\PickMe` and the WebView2 interface will open automatically. If WebView2 Runtime is not installed, the application will prompt you to download it from the Microsoft official website.

### 2. Server / Development Mode

```bash
python -m scripts.serve --host 0.0.0.0 --port 8000
```

By default, uses `browser` storage mode where each visitor receives a UUID backed by a JSON file on the server (e.g. `<app-data-dir>/users/{uuid}.pickme.v2.json`). The browser keeps a short-lived cached payload locally for faster startup. Available parameters:

| Parameter | Description |
| ---- | ---- |
| `--app-data-dir` | Directory used to store application data. |
| `--reload` | Enable FastAPI hot reload for development |

Windows users can also run `scripts\serve.bat` for quick startup.

## Classrooms & Data Storage

- First run includes a default classroom **"杭州黑马 AI Python 就业 3期"** with sample student list for immediate testing.
- **Desktop Mode**: All data is stored in `%LOCALAPPDATA%\PickMe\local.pickme.v2.json`, a single unified JSON file that contains preferences, runtime state, classes, and students.
- **Server Mode**: Each visitor receives a UUID on first load; the backend stores the unified JSON at `%LOCALAPPDATA%\PickMe\users/{uuid}.pickme.v2.json`. The browser keeps only a refreshed runtime cache (`pickme::uuid` and `pickme::data`) to stay in sync.
- Each classroom keeps its student list, pick history, and cooldown state inside that unified file; updates persist automatically after every action.

## Building Single-File EXE

```bash
pyinstaller pickme.spec
```

The generated executable will be located at `dist/PickMe.exe`. The GitHub Actions workflow `.github/workflows/build-and-release.yml` is configured to build for x86, x64, and ARM64 architectures.

## Project Structure

```txt
scripts/desktop.pyw       # WebView2 wrapper entry point (desktop mode)
scripts/serve.py          # FastAPI server startup script
app/                      # FastAPI application, templates, and static resources
app/metadata.py           # Application metadata
```
