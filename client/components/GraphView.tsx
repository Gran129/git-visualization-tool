import type { GraphCommit } from "../../shared/types";
import { layoutStringGraph, seriesPath } from "../stringGraph";

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

  return (
    <div className="graph-pane">
      <div className="string-graph-header">
        <strong>提交说明</strong>
        <span className="line-legend">
          <span className="line-legend-item series">
            <i />
            系列线：负向（子→父）与正向（父→子）同属一条系列
          </span>
          <span className="line-legend-item constant">
            <i />
            恒定线：贯穿泳道，横坐标不变
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
            {layout.constantLines.map((line) => (
              <line
                key={`constant-${line.lane}-${line.y1}-${line.y2}`}
                className="subtraction-line constant"
                x1={line.x}
                y1={line.y1}
                x2={line.x}
                y2={line.y2}
              />
            ))}
            {layout.seriesLines.map((line) => (
              <path
                key={`series-${line.fromHash}-${line.toHash}`}
                className="subtraction-line series"
                d={seriesPath(line)}
                fill="none"
                stroke={laneColor(line.lane)}
              />
            ))}
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
