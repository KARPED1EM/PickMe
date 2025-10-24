# PickMe

English | [中文](README_zh.md)

PickMe is a random name picker tool built with FastAPI and modern web frontend. It can run as a desktop application (using WebView2) or in server mode.

## Features
- 🎯 **Random Selection**: Pick individual students or groups with configurable cooldown periods to avoid frequent repetitions
- 🗂️ **Classroom Management**: Create, switch, and delete classrooms with complete data isolation and drag-to-reorder support
- 💾 **Multi-Platform Persistence**: Desktop mode writes to local user directory; server mode stores in browser `localStorage`
- 🪄 **User-Friendly Interface**: Context menus, cooldown queue, pick history, and more for easy interaction
- 🧳 **One-Click Packaging**: PyInstaller configuration included for single-file EXE distribution

## Platform Support

**Official Support**: Windows (x86, x64, ARM64)

> **Note**: This application officially targets Windows across multiple architectures. Linux and macOS have not been adapted, and compatibility is unknown.

## Environment Setup

```bash
python -m venv .venv
.venv\Scripts\activate            # Windows PowerShell
pip install -r requirements.txt
```

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
By default, uses `browser` storage mode where each visitor's data is saved in their browser's `localStorage` independently. Available parameters:

| Parameter | Description |
| ---- | ---- |
| `--storage browser` | (Default) Persist data per client browser |
| `--storage filesystem` | Write data to server directory, supports `--user-data-dir` for custom location |
| `--reload` | Enable FastAPI hot reload for development |

Windows users can also run `scripts\serve.bat` for quick startup.

## Classrooms & Data Storage
- First run includes a default classroom **"杭州黑马 AI Python 就业 3期"** with sample student list for immediate testing.
- **Desktop Mode**: All classroom data is saved to `%LOCALAPPDATA%\PickMe\pickme_state.json` in the current user's directory.
- **Server Mode**: Data is saved to the visitor's browser `localStorage` by default; switching browsers or devices creates independent data copies.
- Each classroom has its own student list, pick history, and cooldown state; data is automatically persisted when switching classrooms.

## Building Single-File EXE
```bash
pyinstaller scripts/desktop.pyw --clean --onefile --noconsole ^
  --name PickMe ^
  --icon icon.ico ^
  --add-data "app/templates;app/templates" ^
  --add-data "app/static;app/static" ^
  --add-data "app/data;app/data"
```
The generated executable will be located at `dist/PickMe.exe`. The GitHub Actions workflow `.github/workflows/build-and-release.yml` is configured to build for x86, x64, and ARM64 architectures.

## Project Structure
```
scripts/desktop.pyw       # WebView2 wrapper entry point (desktop mode)
scripts/serve.py          # FastAPI server startup script
app/                      # FastAPI application, templates, and static resources
app/paths.py              # Runtime paths and user data directory locator
app/metadata.py           # Application metadata (version: v2.0.0)
```





