import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { DiffView } from "./components/DiffView";
import { GraphView } from "./components/GraphView";
import { laneColor } from "./components/GraphView";
import type {
  BlameLine,
  CommitDetail,
  CommitFile,
  GraphPayload,
  GitRuntimeInfo,
  RefInfo,
  ReflogEntry,
  RepoSummary,
  SearchHit,
  StashEntry,
  StatusPayload,
  TreeEntry,
} from "../shared/types";

type Tab = "changes" | "commit" | "tree" | "blame" | "reflog" | "compare";
type DialogKind =
  | "branch"
  | "tag"
  | "merge"
  | "rebase"
  | "reset"
  | "clone"
  | "remote"
  | "stash"
  | null;

const RECENTS_KEY = "git-viz-recents";

function loadRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveRecent(path: string): void {
  const next = [path, ...loadRecents().filter((item) => item !== path)].slice(0, 12);
  localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
}

export function App() {
  const [path, setPath] = useState("");
  const [pathDraft, setPathDraft] = useState("");
  const [summary, setSummary] = useState<RepoSummary | null>(null);
  const [graph, setGraph] = useState<GraphPayload | null>(null);
  const [refs, setRefs] = useState<RefInfo[]>([]);
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [stash, setStash] = useState<StashEntry[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<CommitDetail | null>(null);
  const [tab, setTab] = useState<Tab>("changes");
  const [message, setMessage] = useState("");
  const [amend, setAmend] = useState(false);
  const [diff, setDiff] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [tree, setTree] = useState<TreeEntry[]>([]);
  const [treeDir, setTreeDir] = useState("");
  const [blame, setBlame] = useState<BlameLine[]>([]);
  const [blameFile, setBlameFile] = useState("");
  const [reflog, setReflog] = useState<ReflogEntry[]>([]);
  const [compareFrom, setCompareFrom] = useState("");
  const [compareTo, setCompareTo] = useState("");
  const [compareFiles, setCompareFiles] = useState<CommitFile[]>([]);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [dialogValue, setDialogValue] = useState("");
  const [dialogExtra, setDialogExtra] = useState("");
  const [recents, setRecents] = useState<string[]>(loadRecents());
  const [gitRuntime, setGitRuntime] = useState<GitRuntimeInfo | null>(null);

  const showError = (err: unknown) => {
    setError(err instanceof Error ? err.message : String(err));
  };

  const refresh = useCallback(
    async (repoPath: string) => {
      setBusy(true);
      setError(null);
      try {
        const [nextSummary, nextGraph, nextRefs, nextStatus, nextStash] = await Promise.all([
          api.repo(repoPath),
          api.graph(repoPath),
          api.refs(repoPath),
          api.status(repoPath),
          api.stash(repoPath),
        ]);
        setSummary(nextSummary);
        setGraph(nextGraph);
        setRefs(nextRefs);
        setStatus(nextStatus);
        setStash(nextStash);
        setSelected((current) => current ?? nextGraph.head);
        saveRecent(repoPath);
        setRecents(loadRecents());
      } catch (err) {
        showError(err);
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  useEffect(() => {
    void (async () => {
      try {
        const runtime = await api.gitRuntime();
        setGitRuntime(runtime);
      } catch {
        // ignore — status bar will hide git info
      }
      try {
        const defaults = await api.defaultPath();
        setPath(defaults.path);
        setPathDraft(defaults.path);
        await refresh(defaults.path);
      } catch (err) {
        showError(err);
      }
    })();
    return api.onOpenPath((dir) => {
      setPathDraft(dir);
      setPath(dir);
      void refresh(dir);
    });
  }, [refresh]);

  useEffect(() => {
    if (!path || !selected || tab !== "commit") {
      return;
    }
    void api
      .commit(path, selected)
      .then(setDetail)
      .catch(showError);
  }, [path, selected, tab]);

  const openRepo = async () => {
    try {
      const opened = await api.open(pathDraft);
      setPath(opened.path);
      await refresh(opened.path);
    } catch (err) {
      showError(err);
    }
  };

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh(path);
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  };

  const localBranches = useMemo(() => refs.filter((ref) => ref.type === "local"), [refs]);
  const remoteBranches = useMemo(() => refs.filter((ref) => ref.type === "remote"), [refs]);
  const tags = useMemo(() => refs.filter((ref) => ref.type === "tag"), [refs]);

  const loadDiff = async (file: string, staged: boolean) => {
    if (!path) {
      return;
    }
    const payload = await api.diff(path, { file, staged });
    setDiff(payload.patch);
    setTab("changes");
  };

  const loadCommitDiff = async (file: string) => {
    if (!path || !selected) {
      return;
    }
    const payload = await api.diff(path, { file, commit: selected });
    setDiff(payload.patch);
  };

  const submitDialog = async () => {
    if (!path || !dialog) {
      return;
    }
    await run(async () => {
      switch (dialog) {
        case "branch":
          await api.branch(path, { action: "create", name: dialogValue, startPoint: selected });
          break;
        case "tag":
          await api.tag(path, { action: "create", name: dialogValue, hash: selected });
          break;
        case "merge":
          await api.merge(path, dialogValue, true);
          break;
        case "rebase":
          await api.rebase(path, dialogValue);
          break;
        case "reset": {
          const mode = dialogExtra as "soft" | "mixed" | "hard";
          await api.reset(path, selected ?? dialogValue, mode);
          break;
        }
        case "clone":
          await api.clone(dialogValue, dialogExtra);
          setPath(dialogExtra);
          setPathDraft(dialogExtra);
          break;
        case "remote":
          await api.remote(path, { action: "add", name: dialogValue, url: dialogExtra });
          break;
        case "stash":
          await api.stashAction(path, {
            action: "save",
            message: dialogValue,
            includeUntracked: true,
          });
          break;
        default: {
          const _never: never = dialog;
          throw new Error(`未处理对话框: ${String(_never)}`);
        }
      }
    });
    setDialog(null);
    setDialogValue("");
    setDialogExtra("");
  };

  return (
    <div className="app">
      <header className="toolbar">
        <div className="brand">Git可视化工具</div>
        <input
          className="path"
          value={pathDraft}
          onChange={(event) => setPathDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              void openRepo();
            }
          }}
          placeholder="仓库绝对路径"
        />
        <button
          onClick={() => {
            void api.selectDirectory().then((dir) => {
              if (!dir) {
                return;
              }
              setPathDraft(dir);
              setPath(dir);
              void refresh(dir);
            });
          }}
        >
          浏览
        </button>
        <button className="primary" onClick={() => void openRepo()} disabled={busy}>
          打开
        </button>
        <button onClick={() => void refresh(path)} disabled={busy || !path}>
          刷新
        </button>
        <button onClick={() => setDialog("clone")}>克隆</button>
        <button
          onClick={() =>
            void run(async () => {
              await api.fetchRemote(path);
            })
          }
        >
          Fetch
        </button>
        <button
          onClick={() =>
            void run(async () => {
              await api.pull(path, false);
            })
          }
        >
          Pull
        </button>
        <button
          onClick={() =>
            void run(async () => {
              if (!summary?.branch) {
                throw new Error("当前不在分支上");
              }
              await api.push(path, "origin", summary.branch, true, false);
            })
          }
        >
          Push
        </button>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <input
            className="search"
            placeholder="搜索提交 / 作者 / Hash"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && path) {
                void api.search(path, query).then(setHits).catch(showError);
              }
            }}
          />
          {hits.length > 0 ? (
            <>
              <div className="section-title">搜索结果</div>
              {hits.map((hit) => (
                <div
                  key={hit.hash}
                  className="search-item"
                  onClick={() => {
                    setSelected(hit.hash);
                    setTab("commit");
                  }}
                >
                  <span className="hash">{hit.hash.slice(0, 7)}</span>
                  <span>{hit.subject}</span>
                </div>
              ))}
            </>
          ) : null}

          <div className="section-title">最近打开</div>
          {recents.map((item) => (
            <div
              key={item}
              className="ref-item"
              onClick={() => {
                setPathDraft(item);
                setPath(item);
                void refresh(item);
              }}
            >
              {item}
            </div>
          ))}

          <div className="section-title">本地分支</div>
          {localBranches.map((ref) => (
            <div
              key={ref.fullName}
              className={`ref-item${ref.current ? " current" : ""}`}
              onClick={() => void run(async () => api.checkout(path, ref.name))}
              onContextMenu={(event) => {
                event.preventDefault();
                setSelected(ref.hash);
              }}
            >
              <span className="dot" style={{ background: laneColor(0) }} />
              {ref.name}
              {ref.upstream ? <span className="muted">→ {ref.upstream}</span> : null}
            </div>
          ))}
          <div className="actions" style={{ padding: "0 12px 8px" }}>
            <button onClick={() => setDialog("branch")}>新建</button>
            <button onClick={() => setDialog("merge")}>合并</button>
            <button onClick={() => setDialog("rebase")}>变基</button>
          </div>

          <div className="section-title">远程分支</div>
          {remoteBranches.map((ref) => (
            <div
              key={ref.fullName}
              className="ref-item"
              onClick={() => void run(async () => api.checkout(path, ref.name))}
            >
              {ref.name}
            </div>
          ))}

          <div className="section-title">标签</div>
          {tags.map((ref) => (
            <div
              key={ref.fullName}
              className="ref-item"
              onClick={() => {
                setSelected(ref.hash);
                setTab("commit");
              }}
            >
              {ref.name}
            </div>
          ))}
          <div className="actions" style={{ padding: "0 12px 8px" }}>
            <button onClick={() => setDialog("tag")}>打标签</button>
          </div>

          <div className="section-title">Stash</div>
          {stash.map((entry) => (
            <div key={entry.ref} className="stash-item">
              <span>{entry.message}</span>
              <button
                onClick={() =>
                  void run(async () => api.stashAction(path, { action: "apply", ref: entry.ref }))
                }
              >
                应用
              </button>
              <button
                onClick={() =>
                  void run(async () => api.stashAction(path, { action: "drop", ref: entry.ref }))
                }
              >
                删除
              </button>
            </div>
          ))}
          <div className="actions" style={{ padding: "0 12px 8px" }}>
            <button onClick={() => setDialog("stash")}>暂存工作区</button>
          </div>
        </aside>

        {graph ? (
          <GraphView
            commits={graph.commits}
            laneCount={graph.laneCount}
            head={graph.head}
            selected={selected}
            onSelect={(hash) => {
              setSelected(hash);
              setTab("commit");
            }}
          />
        ) : (
          <div className="graph-pane panel-body muted">打开仓库后，提交说明会以字符串节点显示，并用连线接在一起</div>
        )}

        <section className="detail">
          <div className="tabs">
            {(
              [
                ["changes", "工作区"],
                ["commit", "提交"],
                ["tree", "文件树"],
                ["blame", "追溯"],
                ["reflog", "Reflog"],
                ["compare", "对比"],
              ] as Array<[Tab, string]>
            ).map(([id, label]) => (
              <button
                key={id}
                className={tab === id ? "active" : ""}
                onClick={() => {
                  setTab(id);
                  if (id === "tree" && path && selected) {
                    setTreeDir("");
                    void api.tree(path, selected, "").then(setTree).catch(showError);
                  }
                  if (id === "reflog" && path) {
                    void api.reflog(path).then(setReflog).catch(showError);
                  }
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="panel-body">
            {tab === "changes" ? (
              <>
                <div className="commit-box">
                  <textarea
                    placeholder="提交说明（类似 git-cola / lazygit）"
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                  />
                  <label className="muted">
                    <input
                      type="checkbox"
                      checked={amend}
                      onChange={(event) => setAmend(event.target.checked)}
                    />{" "}
                    修订上一次提交 (amend)
                  </label>
                  <div className="actions">
                    <button
                      className="primary"
                      onClick={() =>
                        void run(async () => {
                          await api.commitChanges(path, message, amend);
                          setMessage("");
                          setAmend(false);
                        })
                      }
                    >
                      提交
                    </button>
                    <button
                      onClick={() =>
                        void run(async () => {
                          for (const file of status?.files ?? []) {
                            await api.stage(path, file.path);
                          }
                        })
                      }
                    >
                      全部暂存
                    </button>
                  </div>
                </div>
                {(status?.files ?? []).map((file) => (
                  <div key={file.path} className="file-item">
                    <span className="hash">
                      {file.indexStatus}
                      {file.worktreeStatus}
                    </span>
                    <span
                      style={{ flex: 1, cursor: "pointer" }}
                      onClick={() => void loadDiff(file.path, file.staged)}
                    >
                      {file.path}
                    </span>
                    {file.untracked || file.worktreeStatus !== " " ? (
                      <button onClick={() => void run(async () => api.stage(path, file.path))}>
                        暂存
                      </button>
                    ) : null}
                    {file.staged ? (
                      <button onClick={() => void run(async () => api.unstage(path, file.path))}>
                        取消
                      </button>
                    ) : null}
                    <button
                      className="danger"
                      onClick={() =>
                        void run(async () => api.discard(path, file.path, file.untracked))
                      }
                    >
                      丢弃
                    </button>
                  </div>
                ))}
                <DiffView patch={diff} />
              </>
            ) : null}

            {tab === "commit" && detail ? (
              <>
                <h3>{detail.subject}</h3>
                <div className="muted">
                  {detail.author} &lt;{detail.email}&gt; · {detail.authorDate}
                </div>
                <div className="hash">{detail.hash}</div>
                {detail.body ? <p>{detail.body}</p> : null}
                <div className="actions">
                  <button
                    onClick={() => void run(async () => api.checkout(path, detail.hash))}
                  >
                    检出
                  </button>
                  <button
                    onClick={() => void run(async () => api.cherryPick(path, detail.hash))}
                  >
                    Cherry-pick
                  </button>
                  <button onClick={() => void run(async () => api.revert(path, detail.hash))}>
                    Revert
                  </button>
                  <button
                    onClick={() => {
                      setDialog("reset");
                      setDialogExtra("mixed");
                    }}
                  >
                    Reset
                  </button>
                </div>
                {detail.files.map((file) => (
                  <div
                    key={file.path}
                    className="file-item"
                    onClick={() => void loadCommitDiff(file.path)}
                  >
                    <span className="hash">{file.status}</span>
                    <span>
                      {file.path} (+{file.insertions} / -{file.deletions})
                    </span>
                  </div>
                ))}
                <DiffView patch={diff} />
              </>
            ) : null}

            {tab === "tree" ? (
              <>
                <div className="muted">{treeDir || "/"}</div>
                {treeDir ? (
                  <div
                    className="tree-row"
                    onClick={() => {
                      const parent = treeDir.split("/").slice(0, -1).join("/");
                      setTreeDir(parent);
                      if (path && selected) {
                        void api.tree(path, selected, parent).then(setTree).catch(showError);
                      }
                    }}
                  >
                    ../
                  </div>
                ) : null}
                {tree.map((entry) => (
                  <div
                    key={entry.path}
                    className="tree-row"
                    onClick={() => {
                      if (entry.type === "tree" && path && selected) {
                        setTreeDir(entry.path);
                        void api.tree(path, selected, entry.path).then(setTree).catch(showError);
                      } else {
                        setBlameFile(entry.path);
                        void loadCommitDiff(entry.path);
                        if (path && selected) {
                          void api
                            .blame(path, entry.path, selected)
                            .then(setBlame)
                            .catch(showError);
                        }
                      }
                    }}
                  >
                    <span className="hash">{entry.type}</span>
                    {entry.name}
                  </div>
                ))}
              </>
            ) : null}

            {tab === "blame" ? (
              <>
                <input
                  className="search"
                  placeholder="文件路径，回车加载 blame"
                  value={blameFile}
                  onChange={(event) => setBlameFile(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && path && blameFile) {
                      void api
                        .blame(path, blameFile, selected ?? undefined)
                        .then(setBlame)
                        .catch(showError);
                    }
                  }}
                />
                {blame.map((line) => (
                  <div key={`${line.lineNumber}-${line.hash}`} className="blame-line">
                    <span className="hash">{line.hash.slice(0, 7)}</span>
                    <span className="muted">{line.author}</span>
                    <span>{line.content}</span>
                  </div>
                ))}
              </>
            ) : null}

            {tab === "reflog" ? (
              reflog.map((entry) => (
                <div
                  key={`${entry.hash}-${entry.selector}`}
                  className="file-item"
                  onClick={() => {
                    setSelected(entry.hash);
                    setTab("commit");
                  }}
                >
                  <span className="hash">{entry.hash.slice(0, 7)}</span>
                  <span>{entry.selector}</span>
                  <span className="muted">{entry.message}</span>
                </div>
              ))
            ) : null}

            {tab === "compare" ? (
              <>
                <input
                  className="search"
                  placeholder="起始引用"
                  value={compareFrom}
                  onChange={(event) => setCompareFrom(event.target.value)}
                />
                <input
                  className="search"
                  placeholder="目标引用"
                  value={compareTo}
                  onChange={(event) => setCompareTo(event.target.value)}
                />
                <button
                  onClick={() => {
                    if (path) {
                      void api
                        .compare(path, compareFrom, compareTo)
                        .then(setCompareFiles)
                        .catch(showError);
                    }
                  }}
                >
                  对比
                </button>
                {compareFiles.map((file) => (
                  <div
                    key={file.path}
                    className="file-item"
                    onClick={() => {
                      if (!path) {
                        return;
                      }
                      void api
                        .diff(path, { file: file.path, from: compareFrom, to: compareTo })
                        .then((payload) => setDiff(payload.patch))
                        .catch(showError);
                    }}
                  >
                    {file.path} (+{file.insertions} / -{file.deletions})
                  </div>
                ))}
                <DiffView patch={diff} />
              </>
            ) : null}
          </div>
        </section>
      </div>

      <footer className="status-bar">
        <span>
          {summary
            ? `${summary.detached ? "DETACHED" : summary.branch ?? "无分支"}  ${summary.head?.slice(0, 7) ?? ""}  ↑${summary.ahead} ↓${summary.behind}`
            : "未打开仓库"}
        </span>
        <span>
          {gitRuntime
            ? `${gitRuntime.source === "bundled" ? "内置" : "系统"} ${gitRuntime.version || "Git"}`
            : "正在检测 Git…"}
          {" · "}
          {busy ? "工作中…" : `${graph?.commits.length ?? 0} / ${graph?.total ?? 0} 提交`}
        </span>
      </footer>

      {error ? (
        <div className="toast" onClick={() => setError(null)}>
          {error}
        </div>
      ) : null}

      {dialog ? (
        <div className="dialog-backdrop" onClick={() => setDialog(null)}>
          <div className="dialog" onClick={(event) => event.stopPropagation()}>
            <strong>
              {dialog === "branch"
                ? "新建分支"
                : dialog === "tag"
                  ? "创建标签"
                  : dialog === "merge"
                    ? "合并到当前分支"
                    : dialog === "rebase"
                      ? "变基到"
                      : dialog === "reset"
                        ? "Reset 当前 HEAD"
                        : dialog === "clone"
                          ? "克隆仓库"
                          : dialog === "remote"
                            ? "添加远程"
                            : "保存 Stash"}
            </strong>
            {dialog === "reset" ? (
              <select value={dialogExtra} onChange={(event) => setDialogExtra(event.target.value)}>
                <option value="soft">soft</option>
                <option value="mixed">mixed</option>
                <option value="hard">hard</option>
              </select>
            ) : (
              <input
                placeholder={
                  dialog === "clone"
                    ? "仓库 URL"
                    : dialog === "merge" || dialog === "rebase"
                      ? "目标分支"
                      : dialog === "remote"
                        ? "远程名"
                        : "名称 / 说明"
                }
                value={dialogValue}
                onChange={(event) => setDialogValue(event.target.value)}
              />
            )}
            {dialog === "clone" || dialog === "remote" ? (
              <input
                placeholder={dialog === "clone" ? "本地目标路径" : "远程 URL"}
                value={dialogExtra}
                onChange={(event) => setDialogExtra(event.target.value)}
              />
            ) : null}
            <div className="actions">
              <button className="primary" onClick={() => void submitDialog()}>
                确定
              </button>
              <button onClick={() => setDialog(null)}>取消</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
