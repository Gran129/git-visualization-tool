# 内置便携 Git

此目录在执行 `npm run dist` / `npm run prepare:git` 时由 `scripts/prepare-bundled-git.mjs` 填入 [dugite-native](https://github.com/desktop/dugite-native) 发布的便携 Git（与 GitHub Desktop 同源）。

二进制不会提交到 Git。打包时 electron-builder 会把当前平台的 `resources/git/<os>-<arch>/` 复制到应用的 `resources/git/`。
