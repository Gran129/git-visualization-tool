# Git可视化工具

本地 Git 仓库的**桌面应用程序**（Electron）。融合 ungit、gitk / Git Graph、git-cola、lazygit、gitg、SourceGit 等开源工具的核心能力：提交图、工作区暂存、分支/标签、合并变基、Stash、Blame、Reflog 与差异对比。

最终打包产物是可双击运行的安装包 / 可执行文件，**不需要打开 Chrome、Edge 或其他浏览器**。

## 系统要求

- 本机已安装 [Git](https://git-scm.com/)
- 开发时需要 Node.js 20+

## 开发

```bash
npm install
npm test
npm run dev
```

`npm run dev` 会启动桌面窗口（不是浏览器标签页）。

## 打包成真正的应用程序

```bash
npm run dist
```

按当前操作系统生成安装包，输出目录为 `release/`：

| 系统 | 命令 | 产物 |
|------|------|------|
| Linux | `npm run dist:linux` | `.AppImage`（免安装）、`.deb`（可安装） |
| Windows | `npm run dist:win` | NSIS 安装程序 `.exe` |
| macOS | `npm run dist:mac` | `.dmg` |

把对应文件拷到目标电脑，双击即可运行。Windows / macOS 请在对应系统上执行打包命令。

## 使用

1. 启动应用后，点「浏览」选择仓库目录，或使用菜单 **文件 → 打开仓库**（Ctrl/Cmd+O）
2. 中间是提交泳道图
3. 左侧管理分支、远程、标签、Stash
4. 右侧查看工作区、提交详情、文件树、Blame、Reflog、引用对比

## 可选：网页模式

仍可用 `npm run dev:web` / `npm run start:web` 在浏览器里调试，但这不是发布方式。

## 功能对照

详见 [FEATURES.md](./FEATURES.md)。
