# 开源 Git 可视化工具调研与功能对照

本仓库实现的是这些开源工具的**功能并集中的可运行核心**（Electron 桌面应用 + 内置便携 Git），而不是重新打包它们的源码。发布形态是可双击运行的安装包，不依赖系统浏览器，也不要求用户事先安装 Git。

## 调研对象

| 工具 | 许可 | 形态 | 纳入的能力 |
|------|------|------|------------|
| [ungit](https://github.com/FredrikNoren/ungit) | MIT | Web | 提交节点图、检出/创建分支、merge/rebase、暂存与提交、fetch/push、冲突提示 |
| [gitk](https://git-scm.com/docs/gitk) + git-gui | GPL | 桌面 | 泳道提交图、提交搜索、文件差异、装饰（分支/标签） |
| [git-cola](https://github.com/git-cola/git-cola) / git-dag | GPL-2.0 | 桌面 | 暂存区、amend、DAG、按文件查看 diff |
| [lazygit](https://github.com/jesseduffield/lazygit) | MIT | TUI | 文件/分支/提交/stash 面板、cherry-pick、reset、stash、reflog |
| [gitui](https://github.com/extrawurst/gitui) | MIT | TUI | 状态、diff、提交、分支切换 |
| [gitg](https://wiki.gnome.org/Apps/Gitg) | GPL | 桌面 | 历史浏览、diff、分支 |
| [SourceGit](https://github.com/sourcegit-scm/sourcegit) | MIT | 桌面 | 历史图、工作副本、标签、远程 |
| [GitHub Desktop](https://github.com/desktop/desktop) | MIT | 桌面 | 打开仓库、变更、历史、推送拉取 |
| [tig](https://github.com/jonas/tig) | GPL-2.0 | TUI | 日志浏览、blame、文件历史 |
| [Git Extensions](https://github.com/gitextensions/gitextensions) | GPL | 桌面 | 文件树、对比两个引用 |

闭源工具（GitKraken、Fork、Sublime Merge、SourceTree）只作为交互参考，不复制其专有实现。

## 本项目已实现

- 打开 / 初始化 / 克隆仓库
- 提交图（泳道、合并线、HEAD、分支/标签装饰）
- 工作区：未跟踪/已暂存/未暂存、暂存、取消暂存、丢弃、全部暂存、提交、amend
- 提交详情、文件列表、unified diff
- 检出、新建/删除/重命名分支、合并（no-ff）、变基、cherry-pick、revert
- reset soft/mixed/hard
- 标签创建/删除
- stash save/apply/pop/drop
- fetch / pull / push（含 upstream、force-with-lease）
- 远程添加/删除
- 文件树、blame、文件历史、引用对比、reflog
- 按说明 / 作者 / hash 搜索提交
- 最近打开的仓库
- Electron 桌面窗口、系统文件夹选择、安装包（AppImage / deb / NSIS / dmg）
- 安装包内置便携 Git（dugite-native）；首次运行可把 `git` 装到用户 PATH（不覆盖已有 Git）

## 刻意未做成完整产品级的部分

这些在 Magit / Git Extensions / SourceGit 中很重，需要单独的交互编辑器或托管平台集成：

- 交互式 rebase 的逐步 todo 编辑器
- 逐 hunk / 逐行暂存（当前为文件级暂存 + 完整 diff）
- Git LFS、submodule 完整生命周期、GPG 签名向导
- GitHub/GitLab PR 与 code review
- 内置三向合并编辑器（冲突文件会在工作区标出，需在外部编辑后暂存）
