import { createApp } from "./app.js";
import { defaultRepoPath } from "./ops.js";

const port = Number(process.env.GIT_VIZ_PORT ?? process.env.PORT ?? 4173);
const host = process.env.GIT_VIZ_HOST ?? "0.0.0.0";

const app = createApp();

app.listen(port, host, () => {
  const repo = defaultRepoPath();
  console.log(`Git可视化工具 API  http://${host}:${port}`);
  console.log(`默认仓库  ${repo}`);
});
