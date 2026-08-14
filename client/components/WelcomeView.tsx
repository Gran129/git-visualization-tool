import { useMemo, useState } from "react";
import {
  HOSTING_PROVIDERS,
  classifyHosting,
  hostingProviderById,
  openHostingNewRepo,
  suggestedCloneDest,
  type HostingProvider,
} from "../repoOnboarding";

export interface WelcomeViewProps {
  recents: string[];
  homeDir: string;
  busy: boolean;
  canBrowse: boolean;
  onOpenLocal: (repoPath: string) => Promise<void>;
  onPickDirectory: () => Promise<string | null>;
  onClone: (url: string, dest: string) => Promise<void>;
  onInit: (dest: string, remoteUrl: string) => Promise<void>;
}

export function WelcomeView({
  recents,
  homeDir,
  busy,
  canBrowse,
  onOpenLocal,
  onPickDirectory,
  onClone,
  onInit,
}: WelcomeViewProps) {
  const [localPath, setLocalPath] = useState("");
  const [cloneUrl, setCloneUrl] = useState("");
  const [cloneDest, setCloneDest] = useState("");
  const [destTouched, setDestTouched] = useState(false);
  const [initDest, setInitDest] = useState("");
  const [initRemote, setInitRemote] = useState("");
  const [hostingNote, setHostingNote] = useState<string | null>(null);

  const detectedHost = useMemo(() => classifyHosting(cloneUrl), [cloneUrl]);
  const detectedProvider = hostingProviderById(detectedHost);

  const pickInto = async (setter: (value: string) => void, markDestTouched = false) => {
    const dir = await onPickDirectory();
    if (!dir) {
      return;
    }
    setter(dir);
    if (markDestTouched) {
      setDestTouched(true);
    }
  };

  const handleCloneUrlChange = (value: string) => {
    setCloneUrl(value);
    if (!destTouched) {
      setCloneDest(suggestedCloneDest(homeDir, value));
    }
  };

  const handleOpenHosting = (provider: HostingProvider) => {
    openHostingNewRepo(provider.newRepoUrl);
    setHostingNote(
      `已打开 ${provider.name} 的新建仓库页面。创建完成后，把 HTTPS 或 SSH 地址粘贴到「克隆远程仓库」。`,
    );
  };

  return (
    <div className="welcome">
      <div className="welcome-inner">
        <header className="welcome-hero">
          <div className="welcome-brand">Git可视化工具</div>
          <h1>开始使用前，先选择一个仓库</h1>
          <p>
            首次打开时需要指定本地仓库，或从 GitHub、Gitee、GitLab 等远程托管克隆。如果还没有仓库，可以在本机新建，或先到托管平台创建再克隆回来。
          </p>
        </header>

        <div className="welcome-grid">
          <section className="welcome-card">
            <div className="welcome-kicker">我已有仓库</div>
            <h2>打开本地仓库</h2>
            <p>选择已经克隆或初始化到本机的 Git 目录。</p>
            <div className="welcome-row">
              <input
                value={localPath}
                onChange={(event) => setLocalPath(event.target.value)}
                placeholder="仓库绝对路径"
                disabled={busy}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && localPath.trim()) {
                    void onOpenLocal(localPath.trim());
                  }
                }}
              />
              {canBrowse ? (
                <button type="button" disabled={busy} onClick={() => void pickInto(setLocalPath)}>
                  浏览
                </button>
              ) : null}
              <button
                type="button"
                className="primary"
                disabled={busy || !localPath.trim()}
                onClick={() => void onOpenLocal(localPath.trim())}
              >
                打开
              </button>
            </div>
          </section>

          <section className="welcome-card">
            <div className="welcome-kicker">我已有远程仓库</div>
            <h2>克隆远程仓库</h2>
            <p>
              粘贴 GitHub、Gitee、GitLab 等地址。
              {detectedProvider ? ` 已识别为 ${detectedProvider.name}。` : ""}
            </p>
            <input
              value={cloneUrl}
              onChange={(event) => handleCloneUrlChange(event.target.value)}
              placeholder="https://github.com/user/repo.git 或 git@gitee.com:user/repo.git"
              disabled={busy}
            />
            <div className="welcome-row">
              <input
                value={cloneDest}
                onChange={(event) => {
                  setDestTouched(true);
                  setCloneDest(event.target.value);
                }}
                placeholder={homeDir ? suggestedCloneDest(homeDir, "") : "本地目标路径"}
                disabled={busy}
              />
              {canBrowse ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void pickInto(setCloneDest, true)}
                >
                  浏览
                </button>
              ) : null}
            </div>
            <button
              type="button"
              className="primary"
              disabled={busy || !cloneUrl.trim() || !cloneDest.trim()}
              onClick={() => void onClone(cloneUrl.trim(), cloneDest.trim())}
            >
              克隆到本地
            </button>
          </section>

          <section className="welcome-card">
            <div className="welcome-kicker">还没有仓库</div>
            <h2>新建本地仓库</h2>
            <p>在本机创建一个空的 Git 仓库。可选填远程地址，创建后会添加为 origin。</p>
            <div className="welcome-row">
              <input
                value={initDest}
                onChange={(event) => setInitDest(event.target.value)}
                placeholder={homeDir ? suggestedCloneDest(homeDir, "my-repo") : "新仓库目录"}
                disabled={busy}
              />
              {canBrowse ? (
                <button type="button" disabled={busy} onClick={() => void pickInto(setInitDest)}>
                  浏览
                </button>
              ) : null}
            </div>
            <input
              value={initRemote}
              onChange={(event) => setInitRemote(event.target.value)}
              placeholder="可选：origin 远程 URL"
              disabled={busy}
            />
            <button
              type="button"
              className="primary"
              disabled={busy || !initDest.trim()}
              onClick={() => void onInit(initDest.trim(), initRemote.trim())}
            >
              创建本地仓库
            </button>
          </section>

          <section className="welcome-card">
            <div className="welcome-kicker">还没有远程仓库</div>
            <h2>去托管平台新建</h2>
            <p>
              本工具不会代替你登录 GitHub / Gitee。请先在网站上创建空仓库，再回到左侧把地址克隆下来。
            </p>
            <div className="welcome-hosts">
              {HOSTING_PROVIDERS.map((provider) => (
                <button
                  key={provider.id}
                  type="button"
                  disabled={busy}
                  onClick={() => handleOpenHosting(provider)}
                >
                  <strong>{provider.name}</strong>
                  <span>{provider.hint}</span>
                </button>
              ))}
            </div>
            {hostingNote ? <p className="welcome-note">{hostingNote}</p> : null}
          </section>
        </div>

        {recents.length > 0 ? (
          <section className="welcome-recents">
            <div className="welcome-kicker">最近打开</div>
            <ul>
              {recents.map((item) => (
                <li key={item}>
                  <button type="button" disabled={busy} onClick={() => void onOpenLocal(item)}>
                    {item}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {busy ? <div className="welcome-busy">正在处理仓库，请稍候…</div> : null}
      </div>
    </div>
  );
}
