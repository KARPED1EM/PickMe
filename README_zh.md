# PickMe 点名助手

[English](README.md) | [中文](#pickme-点名助手)

PickMe 是一款基于 FastAPI 与现代 Web 前端的随机点名工具，可在桌面端（WebView2 封装）或服务器模式下使用，帮助老师轻松开展课堂互动。

## 功能特点
- 🎯 **随机抽取**：支持单人 / 小组随机抽取，冷却时间可配置，避免频繁重复点名
- 🗂️ **班级管理**：可创建、切换、删除班级，数据完全隔离，并支持拖拽调整显示顺序
- 💾 **多终端持久化**：桌面模式写入本地用户目录，服务器模式存入浏览器 `localStorage`
- 🪄 **交互友好**：右键快捷菜单、冷却队列、抽取历史等信息一目了然
- 🧳 **一键打包**：提供 PyInstaller 配置，生成单文件 EXE 方便分发

## 平台支持

**官方支持**: Windows (x86, x64, ARM64)

> **注意**: 本应用官方仅支持 Windows 平台的多种架构。Linux 和 macOS 尚未适配，兼容性未知。

## 环境准备

```bash
python -m venv .venv
.venv\Scripts\activate            # Windows PowerShell
pip install -r requirements.txt
```

## 运行方式

### 1. 桌面（WebView2）模式
```bash
python scripts/desktop.pyw
```
首次启动会在本机 `%LOCALAPPDATA%\PickMe` 目录下生成数据文件，并自动打开 WebView2 界面。若系统未安装 WebView2 运行时，应用会提示您访问微软官方网站下载。

### 2. 服务器 / 开发模式
```bash
python -m scripts.serve --host 0.0.0.0 --port 8000
```
默认使用 `browser` 存储模式，每位访问者的数据保存在其浏览器 `localStorage` 中，互不影响。也可指定参数：

| 参数 | 说明 |
| ---- | ---- |
| `--storage browser` | （默认）按客户端浏览器持久化 |
| `--storage filesystem` | 将数据写入服务器指定目录，支持 `--user-data-dir` 自定义位置 |
| `--reload` | 开发调试时启用 FastAPI 热重载 |

Windows 用户亦可执行 `scripts\serve.bat` 快速启动。

## 班级与数据存储
- 首次运行会预置默认班级 **「杭州黑马 AI Python 就业 3期」**，包含示例名单，可直接体验功能。
- **桌面模式**：所有班级数据写入当前用户目录 `%LOCALAPPDATA%\PickMe\pickme_state.json`。
- **服务器模式**：默认写入访问者浏览器的 `localStorage`；切换浏览器或设备会得到独立的数据副本。
- 每个班级拥有独立的学生列表、抽取历史与冷却状态；切换班级时会自动持久化当前班级的数据。

## 打包单文件 EXE
```bash
pyinstaller scripts/desktop.pyw --clean --onefile --noconsole ^
  --name PickMe ^
  --icon icon.ico ^
  --add-data "app/templates;app/templates" ^
  --add-data "app/static;app/static" ^
  --add-data "app/data;app/data"
```
生成的可执行文件位于 `dist/PickMe.exe`。GitHub Actions 工作流 `.github/workflows/build-and-release.yml` 已配置 x86 / x64 / ARM64 多架构打包流程。

## 项目结构
```
scripts/desktop.pyw       # WebView2 封装入口（桌面模式）
scripts/serve.py          # FastAPI 服务启动脚本
app/                      # FastAPI 应用、模板与静态资源
app/paths.py              # 运行时路径与用户数据目录定位
app/metadata.py           # 应用元数据（版本：v2.0.0）
```

## 许可证

MIT License
