import type { GraphCommit, GraphCommitRole } from "../../shared/types";
import { layoutStringGraph, seriesPath, staggerDelay, staggerDelayMs } from "../stringGraph";

const LANE_COLORS = [
  "#58a6ff",
  "#3fb950",
  "#d29922",
  "#f778ba",
  "#bc8cff",
  "#79c0ff",
  "#ffa657",
  "#ff7b72",
];

const ROLE_LABEL: Partial<Record<GraphCommitRole, string>> = {
  root: "根",
  merge: "合并",
  octopus: "章鱼合并",
  cherryPick: "摘取",
  revert: "撤销",
  stash: "Stash",
};

export function laneColor(lane: number): string {
  const color = LANE_COLORS[lane % LANE_COLORS.length];
  return color ?? "#58a6ff";
}

interface GraphViewProps {
  commits: GraphCommit[];
  laneCount: number;
  head: string | null;
  selected: string | null;
  detached?: boolean;
  onSelect: (hash: string) => void;
}

function formatTime(timestamp: number): string {
  if (!timestamp) {
    return "";
  }
  const date = new Date(timestamp * 1000);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString();
}

export function GraphView({ commits, head, selected, detached, onSelect }: GraphViewProps) {
  const layout = layoutStringGraph(commits);

  return (
    <div className="graph-pane">
      <div className="string-graph-header">
        <strong>节点树</strong>
        <span className="line-legend">
          <span className="line-legend-item series">
            <i />
            系列线：负向（子→父）与正向（父→子）同属一条系列
          </span>
          <span className="line-legend-item constant">
            <i />
            恒定线：贯穿泳道，横坐标不变
          </span>
          <span className="line-legend-item">旁支是另一条系列，相对主线以恒定线贯穿</span>
          <span className="line-legend-item ghost">
            <i />
            虚父表示父提交未载入
          </span>
        </span>
      </div>
      {commits.length === 0 ? (
        <div className="graph-empty muted">这个仓库还没有提交说明</div>
      ) : (
        <div className="string-graph" style={{ width: layout.width, height: layout.height }}>
          <svg
            className="string-graph-edges"
            width={layout.width}
            height={layout.height}
            aria-hidden="true"
          >
            {layout.constantLines.map((line, index) => (
              <line
                key={`constant-${line.lane}-${line.y1}-${line.y2}`}
                className="subtraction-line constant"
                x1={line.x}
                y1={line.y1}
                x2={line.x}
                y2={line.y2}
                style={{ animationDelay: staggerDelay(index, 40, 16) }}
              />
            ))}
            {layout.seriesLines.map((line, index) => {
              const related = Boolean(
                selected && (line.fromHash === selected || line.toHash === selected),
              );
              return (
                <path
                  key={`series-${line.fromHash}-${line.toHash}`}
                  className={`subtraction-line series${related ? " related" : ""}`}
                  d={seriesPath(line)}
                  fill="none"
                  stroke={laneColor(line.lane)}
                  pathLength={1}
                  style={{ animationDelay: `${staggerDelayMs(index) + 80}ms` }}
                />
              );
            })}
          </svg>
          {layout.nodes.map((node, index) => {
            const isSelected = selected === node.hash;
            const isHead = head === node.hash;
            const color = laneColor(node.lane);
            const roleLabel = node.ghost ? null : (ROLE_LABEL[node.role] ?? null);
            const skipEnter = index >= 28;
            return (
              <button
                key={node.hash}
                type="button"
                className={`string-node${isSelected ? " selected" : ""}${isHead ? " is-head" : ""}${node.ghost ? " ghost" : ""}${skipEnter ? " no-enter" : ""}`}
                style={{
                  left: node.x,
                  top: node.y,
                  width: node.width,
                  minHeight: node.height,
                  height: node.height,
                  borderColor: isSelected || isHead ? color : undefined,
                  animationDelay: skipEnter ? undefined : staggerDelay(index),
                }}
                title={node.comment}
                disabled={node.ghost}
                onClick={() => {
                  if (!node.ghost) {
                    onSelect(node.hash);
                  }
                }}
              >
                <span className="string-node-dot" style={{ background: color }} />
                <span className="string-node-meta">
                  <span className="hash">{node.shortHash}</span>
                  {isHead ? <span className="badge head">{detached ? "HEAD 分离" : "HEAD"}</span> : null}
                  {roleLabel ? <span className={`badge role ${node.role}`}>{roleLabel}</span> : null}
                  {node.refs.map((ref) => (
                    <span key={ref} className={`badge${/tag/i.test(ref) ? " tag" : ""}`}>
                      {ref}
                    </span>
                  ))}
                </span>
                <span className="string-node-subject">{node.subject || "(无说明)"}</span>
                {node.body ? <span className="string-node-body">{node.body}</span> : null}
                {node.ghost ? (
                  <span className="string-node-author muted">窗口外或浅克隆未载入的父提交</span>
                ) : (
                  <span className="string-node-author muted">
                    {node.author}
                    {node.timestamp ? ` · ${formatTime(node.timestamp)}` : ""}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
