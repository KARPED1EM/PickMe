# PickMe 教学点名器

基于 FastAPI + Web 前端的随机点名工具，可在本地桌面环境（WebView2）或服务器模式下运行。桌面版会把数据存到当前用户目录，服务器模式则把数据交给每位访问者的浏览器（`localStorage`），便于多名教师独立使用。

## 功能特性
- 随机点名（单人或按小组），支持冷却时间防止重复抽取
- 学生管理（新增、编辑、删除、导出历史）
- 拖拽式 UI、右键快捷菜单以及动画效果
- 桌面模式使用 WebView2 封装，可生成单文件 EXE

## 环境准备
```bash
python -m venv .venv
.venv\Scripts\activate            # Windows PowerShell
# source .venv/bin/activate       # Linux / macOS
pip install -r requirements.txt
```

## 运行方式

### 1. 桌面（WebView2）模式
```bash
python scripts/desktop_app.pyw
```
Windows 会启动 WebView2 窗口，数据保存位置默认为 `%LOCALAPPDATA%\PickMe\PickMe`。如果未安装 WebView2，程序会引导到官方安装页面。

### 2. 服务器 / 浏览器模式
```bash
python -m scripts.serve --host 0.0.0.0 --port 8000
```
默认使用 `browser` 存储策略，所有变更都写入访问者浏览器的 `localStorage`。适用于多名教师通过浏览器独立管理各自数据的场景。Windows 下也可以执行 `scripts\serve.bat`。

常用选项：

| 开关 | 说明 |
| ---- | ---- |
| `--storage browser` | （默认）每个浏览器持久化到 `localStorage` |
| `--storage filesystem` | 将服务器实例视为单用户，数据写入 `--user-data-dir` |
| `--reload` | 开启 FastAPI 自动重载，便于开发 |

## 数据存储说明
- 桌面模式：`PickMe` 会在当前用户目录创建 `students_data.json`。首次运行会复制 `app/data/students_data.json` 作为初始数据。
- 浏览器模式：后端保持无状态；每次请求都会把当前快照一并返回，由前端写入 `localStorage`。推荐在不同浏览器或隐私窗口中分别使用，以区分不同教师账号。

## 构建单文件 EXE
```bash
pyinstaller scripts/desktop_app.pyw --clean --onefile --noconsole ^
  --name PickMe ^
  --icon icon.ico ^
  --add-data "app/templates;app/templates" ^
  --add-data "app/static;app/static" ^
  --add-data "app/data;app/data"
```
生成的可执行文件位于 `dist/PickMe.exe`。CI 工作流（`.github/workflows/build-and-release.yml`）会自动产出 x86/x64/ARM64 构建。

## 项目结构
```
scripts/desktop_app.pyw   # WebView2 封装入口（桌面模式）
scripts/serve.py          # FastAPI 服务入口
app/                      # FastAPI 应用、前端静态资源、模板
pickme/paths.py           # 运行时路径和用户目录解析
```