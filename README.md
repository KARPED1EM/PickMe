# 🧑‍🏫 PickMe

A lightweight desktop app for **randomly picking students** and managing cooldowns.  
Built with [FastAPI](https://fastapi.tiangolo.com/) + `pywebview`.

---

## 🚀 Features

- 🎯 Random student picker  
- ⏳ Cooldown system to avoid repeats  
- 💾 Auto data saving  
- 🖥️ Local and private

---

## 🧰 Requirements

- Python `3.11+`
- Install dependencies:

```bash
pip install -r requirements.txt
````

---

## 🛠️ Run & Build

### Run (Desktop / WebView)

```bash
python start.pyw
```

### Run (Local Server)

```bash
python run_server.py --reload
```

- Double-click `run_server.py` or `run_server.bat` on Windows to start with default host/port.
- Use the `--host` and `--port` flags to match your deployment setup (defaults to `127.0.0.1:8000`).

### Build (Single File)

```bash
pyinstaller start.pyw --onefile --noconsole --name PickMe --icon "icon.ico" \
  --add-data "app/templates;app/templates" \
  --add-data "app/static;app/static" \
  --add-data "app/data;app/data"
```

---

## 📁 Data

- On first launch, the app creates a `students_data.json` file automatically.
- If `app/data/students_data.json` exists, it’s used as the initial dataset.
- Default cooldown: `3 days`.
- To prefill data:

- Edit `app/data/students_data.json` before build, **or**
- Create `students_data.json` in the user data directory.

| OS      | Path Example                           |
| ------- | -------------------------------------- |
| Windows | `%LOCALAPPDATA%\PickMe\PickMe`         |
| macOS   | `~/Library/Application Support/PickMe` |
| Linux   | `~/.local/share/PickMe`                |
