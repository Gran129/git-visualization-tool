# Git可视化工具

本地 Git 仓库的图形化管理客户端，融合 **ungit**、**gitk / Git Graph**、**git-cola**、**lazygit**、**gitg**、**SourceGit** 等开源工具的核心能力：提交图、工作区暂存、分支/标签、合并变基、Stash、Blame、Reflog 与差异对比。

## 运行

需要 Node.js 20+ 与本机 `git`。

```bash
npm install
npm test
npm run dev
```

开发模式：

- Web UI：http://127.0.0.1:5173
- API：http://127.0.0.1:4173

生产模式：

```bash
npm run build
npm start
```

然后打开 http://127.0.0.1:4173 。

## 使用

1. 在顶栏输入本地仓库的绝对路径，点击「打开」
2. 中间是 gitk / Git Graph 风格的提交泳道图
3. 左侧管理分支、远程、标签、Stash
4. 右侧查看工作区、提交详情、文件树、Blame、Reflog、引用对比

默认打开启动目录下的 Git 仓库；也可用环境变量 `GIT_VIZ_REPO` 指定。

## 功能对照

详见 [FEATURES.md](./FEATURES.md)。
