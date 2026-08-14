# Git可视化工具

本地 Git 仓库的**桌面应用程序**（Electron）。融合 ungit、gitk / Git Graph、git-cola、lazygit、gitg、SourceGit 等开源工具的核心能力：提交图、工作区暂存、分支/标签、合并变基、Stash、Blame、Reflog 与差异对比。

最终打包产物是可双击运行的安装包 / 可执行文件，**不需要打开 Chrome、Edge 或其他浏览器**，也**不需要用户事先安装 Git**。安装包内置便携 Git；若电脑上还没有 `git` 命令，首次启动会把它安装到用户目录并加入 PATH（已有 Git 的不会覆盖）。

## 系统要求

- 使用安装包的用户：**只需本应用**，不必单独安装 Git
- 开发时需要 Node.js 20+（以及本机 Git，用于跑测试和未打包的开发模式）

## 开发

```bash
npm install
npm test
npm run dev
```

`npm run dev` 会启动桌面窗口（不是浏览器标签页）。开发模式会优先使用 `resources/git/` 里已下载的便携 Git，没有则回退到系统 `git`。

## 打包成真正的应用程序

```bash
npm run dist
```

打包前会自动下载当前平台的便携 Git（[dugite-native](https://github.com/desktop/dugite-native)，与 GitHub Desktop 同源）。输出目录为 `release/`：

| 系统 | 命令 | 产物 |
|------|------|------|
| Linux | `npm run dist:linux` | `.AppImage`（免安装）、`.deb`（可安装） |
| Windows | `npm run dist:win` | NSIS 安装程序 `.exe` |
| macOS | `npm run dist:mac` | `.dmg` |

把对应文件拷到目标电脑，双击即可运行。Windows / macOS 请在对应系统上执行打包命令。

内置 Git 的来源：

- 应用内部操作一律走安装包里的 Git，不依赖系统是否已安装
- 若启动时 PATH 上还没有 `git`，会复制一份到用户目录（Linux/macOS：`~/.local/share/git-visualization-tool/git` + `~/.local/bin/git`；Windows：`%LOCALAPPDATA%\git-visualization-tool\`），新开终端即可使用 `git`
- 若系统已经有 Git，只使用内置副本跑图形界面，不会覆盖用户原有的 Git

## 使用

1. 启动应用后，点「浏览」选择仓库目录，或使用菜单 **文件 → 打开仓库**（Ctrl/Cmd+O）
2. 中间是提交泳道图
3. 左侧管理分支、远程、标签、Stash
4. 右侧查看工作区、提交详情、文件树、Blame、Reflog、引用对比
5. 底部状态栏会显示当前使用的是「内置 Git」还是「系统 Git」及其版本

## 可选：网页模式

仍可用 `npm run dev:web` / `npm run start:web` 在浏览器里调试，但这不是发布方式。

## 功能对照

详见 [FEATURES.md](./FEATURES.md)。
