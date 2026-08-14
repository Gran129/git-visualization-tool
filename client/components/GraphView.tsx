import type { GraphCommit } from "../../shared/types";
import { edgePath, layoutStringGraph } from "../stringGraph";

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

export function laneColor(lane: number): string {
  const color = LANE_COLORS[lane % LANE_COLORS.length];
  return color ?? "#58a6ff";
}

interface GraphViewProps {
  commits: GraphCommit[];
  laneCount: number;
  head: string | null;
  selected: string | null;
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

export function GraphView({ commits, head, selected, onSelect }: GraphViewProps) {
  const layout = layoutStringGraph(commits);
  const nodeByHash = new Map(layout.nodes.map((node) => [node.hash, node]));

  return (
    <div className="graph-pane">
      <div className="string-graph-header">
        <strong>提交说明</strong>
        <span className="muted">每个卡片是一个字符串节点，连线把说明和说明接在一起</span>
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
            {layout.edges.map((edge) => {
              const from = nodeByHash.get(edge.fromHash);
              return (
                <path
                  key={`${edge.fromHash}-${edge.toHash}-${edge.kind}`}
                  d={edgePath(edge)}
                  fill="none"
                  stroke={laneColor(from?.lane ?? 0)}
                  strokeWidth={edge.kind === "merge" ? 2.5 : 2}
                  strokeDasharray={edge.kind === "merge" ? "6 4" : undefined}
                />
              );
            })}
          </svg>
          {layout.nodes.map((node) => {
            const isSelected = selected === node.hash;
            const isHead = head === node.hash;
            const color = laneColor(node.lane);
            return (
              <button
                key={node.hash}
                type="button"
                className={`string-node${isSelected ? " selected" : ""}${isHead ? " is-head" : ""}`}
                style={{
                  left: node.x,
                  top: node.y,
                  width: node.width,
                  minHeight: node.height,
                  height: node.height,
                  borderColor: isSelected || isHead ? color : undefined,
                }}
                title={node.comment}
                onClick={() => onSelect(node.hash)}
              >
                <span className="string-node-dot" style={{ background: color }} />
                <span className="string-node-meta">
                  <span className="hash">{node.shortHash}</span>
                  {isHead ? <span className="badge head">HEAD</span> : null}
                  {node.refs.map((ref) => (
                    <span key={ref} className={`badge${/tag/i.test(ref) ? " tag" : ""}`}>
                      {ref}
                    </span>
                  ))}
                </span>
                <span className="string-node-subject">{node.subject || "(无说明)"}</span>
                {node.body ? <span className="string-node-body">{node.body}</span> : null}
                <span className="string-node-author muted">
                  {node.author}
                  {node.timestamp ? ` · ${formatTime(node.timestamp)}` : ""}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
