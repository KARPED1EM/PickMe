# PickMe

[English](README.md) | 中文

PickMe 是一款基于 FastAPI 与现代 Web 前端的随机点名工具，可在桌面端（WebView2 封装）或服务器模式下使用。

## 功能特点

- 🎯 **随机抽取**：支持单人 / 小组随机抽取，冷却时间可配置，避免频繁重复点名
- 🗂️ **班级管理**：可创建、切换、删除班级，数据完全隔离，并支持拖拽调整显示顺序
- 💾 **统一数据存储**：桌面模式为每位用户写入单一 JSON 文件，服务器模式为每位访客分配 UUID 并在后台写入用户目录下的 JSON 数据文件，同时浏览器仅保留最新的运行时缓存
- 🪄 **交互友好**：右键快捷菜单、冷却队列、抽取历史等信息一目了然

## 平台支持

**官方支持**: Windows (x86, x64, ARM64)

> **注意**: 本应用官方仅支持 Windows 平台的多种架构。Linux 和 macOS 尚未适配，兼容性未知。

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

默认使用 `browser` 存储模式，为每位访客分配 UUID 并在服务器的用户数据目录（如 `<app-data-dir>/users/{uuid}.pickme.v2.json`）中持久化 JSON 文件。浏览器仅保留短期运行时缓存，以确保每次进入页面时都能刷新数据。也可指定参数：

| 参数 | 说明 |
| ---- | ---- |
| `--app-data-dir` | 存储应用数据的目录 |
| `--reload` | 开发调试时启用 FastAPI 热重载 |

Windows 用户亦可执行 `scripts\serve.bat` 快速启动。

## 班级与数据存储

- 首次运行会预置默认班级 **「杭州黑马 AI Python 就业 3期」**，包含示例名单，便于立即体验功能。
- **桌面模式**：所有数据写入当前用户目录 `%LOCALAPPDATA%\PickMe\local.pickme.v2.json`，该 JSON 同时包含偏好设置、运行时状态与全部班级信息。
- **服务器模式**：首次访问自动分配 UUID，并在 `%LOCALAPPDATA%\PickMe\users/{uuid}.pickme.v2.json` 中持久化统一 JSON；浏览器仅保留短期运行时缓存（`pickme::uuid` 与 `pickme::data`）以保持同步。
- 每个班级的学生名单、抽取历史与冷却状态都收纳在统一文件中，所有操作都会即时写回。

## 打包单文件 EXE

```bash
pyinstaller pickme.spec
```

生成的可执行文件位于 `dist/PickMe.exe`。GitHub Actions 工作流 `.github/workflows/build-and-release.yml` 已配置 x86 / x64 / ARM64 多架构打包流程。

## 项目结构

```txt
scripts/desktop.pyw       # WebView2 封装入口（桌面模式）
scripts/serve.py          # FastAPI 服务启动脚本
app/                      # FastAPI 应用、模板与静态资源
app/metadata.py           # 应用元数据
```
