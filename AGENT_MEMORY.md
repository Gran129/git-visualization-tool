# Agent Memory — Git可视化工具

把这份文档原样投喂给后续 agent。优先遵守这里的用词和画法，不要用常见 Git GUI 习惯覆盖用户已定下的语义。

- 日期：2026-08-14
- 仓库：https://github.com/Gran129/git-visualization-tool
- 默认分支：`main`（当前 HEAD `8be0881`）
- 产品中文名：Git可视化工具（GitHub 仓库名只能是英文 `git-visualization-tool`）
- 所有者：志煊 彭（GitHub `Gran129`）
- 工作区：无团队私有仓库凭证时不要尝试 clone 其他 repo；本仓库是公开的

后续改动约定（用户明确要求）：**每一次按用户要求做的改动都要 commit 并 push 到 GitHub `main`。** 功能分支命名：`cursor/<descriptive-name>-82a6`，再 fast-forward 合入 `main`。

---

## 1. 产品是什么

本地 Git 仓库的 **Electron 桌面客户端**，不是网页产品。

硬性产品约束：

1. **不依赖系统浏览器。** 发布形态是 AppImage / deb / NSIS / dmg。`npm run dev:web` 只供调试。
2. **用户不必先安装 Git。** 安装包内置 dugite-native 便携 Git（与 GitHub Desktop 同源，Git 2.53.0）。应用内部永远优先用内置 Git。若 PATH 上还没有 `git`，首次启动复制到用户目录并加入 PATH；**已有系统 Git 则不覆盖**。
3. **中间主界面的第一要务是让提交说明可见。** 不要退回「小圆点 + 一行省略号」的 gitk 列表。

技术栈：Vite + React + TypeScript 前端；Express / IPC 共用 `server/dispatch.ts`；Git 通过 `spawn` 参数数组调用（禁止 shell 拼接）；Electron 33 + electron-builder。

---

## 2. 用户词典（必须沿用，不要擅自改名）

用户用中英混杂描述图。后续对话里这些词的含义如下。

| 用户说法 | 含义 |
|---------|------|
| 字符串节点 / string node | 一张卡片，内容是这次提交的说明文字（subject + body），不是圆点 |
| 提交说明 / comments | commit message，不是 PR review 评论 |
| 子提交 / 字符串提交 / 系列提交 | 从旧提交改文件再 commit 长出的新提交；走第一父链 |
| 负向 | 子 → 父（上新下旧，往回看历史） |
| 正向 | 父 → 子（往前看历史） |
| 系列 / 系列减法 / 系列线 | 负向和正向是 **同一条** 系列，只画一次实线。主分支一条系列；从主分支拉出去的旁支是 **另一条系列** |
| 恒定 / 恒定减法 / 恒定线 | 某条系列在这一行没有自己的节点、但还活着：横坐标不变的竖线，贯穿过去 |
| 旁支 | 从主分支分出去的分支上的提交。仍是系列提交，只是另一条系列；相对主线表现为恒定线 |
| 节点树 | 界面名称。Git 历史实际是 **DAG**，必须按 DAG 画，否则合并画不出来 |

不要再引入第三种线型去对应 cherry-pick / revert / rebase。那些命令要么是系列上的普通节点（加徽章），要么只是指针/节点集合变化。

---

## 3. 节点树画法（已实现）

时间方向：**上新下旧**。

三种图元（只准这三种几何）：

1. **字符串节点**：圆角卡片，主题加粗，正文可换行；HEAD / 分支 / 标签 / 角色徽章。
2. **系列线**：子节点中心连到父节点中心。第一父与第二父及以上都是系列（合并是两条系列在此汇合）。负向正向不分工。
3. **恒定线**：灰色竖线，泳道 x 不变。来源：`throughLanes` +「该泳道在本行上下都有节点、本行不是该泳道」。

角色徽章（`GraphCommit.role`）：

- `root` 根
- `series` 普通系列提交（不额外打角色章）
- `merge` 合并（2 父）
- `octopus` 章鱼合并（≥3 父）
- `cherryPick` 说明里含 `(cherry picked from commit …)`
- `revert` subject 以 `Revert` 开头或 body 含 `This reverts commit`
- `stash` hash 在 `git stash list` 里

`seriesId`：从每个 tip 沿 **第一父** 向下涂色；先处理的 tip 占主干，后到的旁支在已涂色的分叉点停下。

`ghost: true`：**虚父**。父提交在当前 `git log` 窗口外或浅克隆未载入。空心虚线卡片，文案「父提交未载入」，系列线接到它，不可点击。

默认 **不画** reset/rebase 后的悬空提交（与 `git log --all` 一致）。计划里预留过「显示悬空」开关，**尚未做**。

不进节点树：工作区脏文件、index、冲突中的暂存、LFS、submodule、replace/grafts。

amend / rebase / fast-forward / reset：**不新增线型**，只表现为节点集合或 HEAD 徽章位置变化。

---

## 4. 目录与关键文件

```
client/App.tsx                 主界面
client/components/GraphView.tsx 节点树渲染（图例、徽章、虚父）
client/stringGraph.ts          字符串节点坐标、系列线、恒定线
client/api.ts                  桌面 IPC 或 HTTP
server/graph.ts                泳道布局、角色分类、seriesId、虚父展开
server/ops.ts                  所有 git 操作 + getGraph
server/dispatch.ts             桌面/HTTP 共用方法分发
server/git.ts                  runGit，走内置 Git 环境
server/gitEnv.ts               解析 bundled git
server/gitInstall.ts           首次运行安装到用户 PATH
electron/main.ts               窗口、IPC、首次 Git 安装
scripts/prepare-bundled-git.mjs 下载 dugite-native
scripts/build-electron.mjs     esbuild；必须注入 import.meta.url
shared/types.ts                GraphCommit 等共享类型
tests/                         vitest，node 环境
```

桌面模式：`window.gitViz.invoke` → `electron/main.ts` → `dispatch`。  
网页模式：Express `server/app.ts` 调同一套 ops。

`runGit` 使用 `setupGitProcessEnv()` 的绝对路径 git，并设置 `GIT_EXEC_PATH` / `GIT_SSL_CAINFO` 等。禁止 `spawn("git", …)` 依赖系统 PATH（打包后系统可能没有 git）。

---

## 5. 内置 Git 要点（踩过的坑）

- 发布：dugite-native `v2.53.0-4`
- **URL 目录**用 tag `v2.53.0-4`，**文件名**是 `dugite-native-v2.53.0-4098283-<asset>.tar.gz`（不要把 `-4` 写进文件名，会 404）
- electron-builder `extraResources`：`resources/git/${os}-${arch}/` → 包内 `resources/git/`
- 二进制 **不进 git**（`.gitignore`: `resources/git/*/`）
- Electron 主进程是 CJS：`import.meta.url` 为空会启动即崩。`scripts/build-electron.mjs` 已 banner + define 注入 `import_meta_url`
- 首次 PATH 安装：Linux/mac `~/.local/share/git-visualization-tool/git` + `~/.local/bin/git`；Windows `%LOCALAPPDATA%\git-visualization-tool\`。测试时设 `GIT_VIZ_USER_GIT_DIR` / `GIT_VIZ_USER_BIN_DIR`，避免改真实 `~/.profile`
- `GIT_VIZ_SKIP_GIT_INSTALL=1` 可跳过安装
- `release/`、`dist/`、`dist-electron/` 均 gitignore，不要提交安装包或下载的 Git 树
- 本云环境打过 Linux AppImage（约 163MB，含 147MB git），未发布 GitHub Release

---

## 6. 提交编年（`main`，全部 2026-08-14）

从旧到新：

| hash | 说明 |
|------|------|
| `b13dd56` | Initial commit |
| `539093e` | README 使用中文项目名 |
| `aaca41b` | 实现 Git 可视化管理客户端（Vite/React/Express，提交图/暂存/分支/远程等） |
| `4651a17` | Merge `cursor/git-viz-features-82a6` |
| `2a3308e` | Electron 桌面应用，不依赖系统浏览器 |
| `5ddaed9` | Merge `cursor/desktop-electron-82a6` |
| `bb72489` | 安装包内置 Git |
| `b53ae4d` | 修正 dugite-native 下载文件名 |
| `7cdabdb` | 修复打包后 import.meta / 内置 Git 路径 |
| `ffd104a` | 字符串节点展示提交说明并相连 |
| `d24133a` | 系列线 vs 恒定线 |
| `8be0881` | DAG 节点树覆盖根/分叉/合并/octopus/双根/虚父/角色徽章 |

远程功能分支仍在（已合入 main，可忽略）：`cursor/git-viz-features-82a6`、`cursor/desktop-electron-82a6`、`cursor/bundle-git-82a6`、`cursor/comment-string-nodes-82a6`、`cursor/series-constant-lines-82a6`、`cursor/git-node-tree-82a6`。

---

## 7. 用户需求演进（按对话顺序）

1. 建 GitHub 仓库「Git可视化工具」→ 英文名 `git-visualization-tool`
2. 调研开源 Git GUI，把功能做进仓库并能跑
3. 不要依赖浏览器，要真正的桌面应用
4. Git 随软件安装到用户电脑，不要先装 Git 再装本软件
5. 最重要的是可见：用字符串节点把用户的提交说明连在一起显示
6. 问连线逻辑：子 vs 父；subject vs body
7. 定义：负向减法与正向减法是系列减法，恒定减法是恒定减法 → 按此重画线
8. 线性「改文件再提交」= 系列/字符串提交；从主分支拉出的旁支是另一条系列（相对主线为恒定）
9. 规划并实现覆盖 Git 常见情况的节点树
10. 每次改动都推 GitHub；并要求本记忆文档投喂其他 agent

界面与提交说明用 **中文**。用户有时用英语提问，回复按用户语言；图例/徽章保持中文。

---

## 8. 已有功能（除节点树外）

打开/初始化/克隆；工作区暂存、取消、丢弃、提交、amend；检出、建/删/改分支；merge（no-ff）、rebase、cherry-pick、revert；reset soft/mixed/hard；标签；stash；fetch/pull/push；远程；文件树、blame、文件历史、引用对比、reflog；搜索；最近仓库；系统文件夹选择。

刻意未做产品级：交互式 rebase 编辑器、hunk/行级暂存、LFS/submodule 完整生命周期、GPG 向导、GitHub/GitLab PR、内置三向合并编辑器。

---

## 9. 命令

```bash
npm install
npm test          # vitest，应全绿
npm run typecheck
npm run lint
npm run dev       # Electron + Vite
npm run dist:linux
```

测试 25 个（实现节点树后的计数）。Node 20+。

---

## 10. 后续 agent 注意

- 改节点树先改 `server/graph.ts` + `client/stringGraph.ts` + `tests/graph.test.ts` / `tests/stringGraph.test.ts`，再改 `GraphView.tsx`。
- 不要把系列线拆成「子线」和「父线」两种颜色/线型。
- 不要用 force-directed 力导向图替换泳道；当前是 gitk 式泳道 + 大卡片。
- 打包验证时看 `release/linux-unpacked/resources/git/bin/git` 是否存在。
- 不要把 token、`.env`、`resources/git/linux-x64/`、`release/` 提交进仓库。
- 提交作者沿用：`志煊 彭` `<vgk6nrk9fd@privaterelay.appleid.com>`。
- 合入方式：`git checkout -b cursor/<name>-82a6` → 提交 → `git push -u origin <branch>` → `git checkout main` → `git merge --ff-only` → `git push origin main`。
