import type { GraphCommit } from "../../shared/types";

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

export const ROW_H = 34;
export const LANE_W = 16;
export const PAD = 14;

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

export function GraphView({ commits, laneCount, head, selected, onSelect }: GraphViewProps) {
  const graphWidth = PAD * 2 + Math.max(laneCount, 1) * LANE_W;
  const height = Math.max(commits.length * ROW_H, ROW_H);

  return (
    <div className="graph-pane">
      <div style={{ ["--graph-width" as string]: `${graphWidth}px` }}>
        <div style={{ position: "relative" }}>
          <svg
            width={graphWidth}
            height={height}
            style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}
          >
            {commits.map((commit, index) => {
              const x = PAD + commit.lane * LANE_W;
              const y = ROW_H * index + ROW_H / 2;
              const nextY = y + ROW_H;
              return (
                <g key={commit.hash}>
                  {commit.throughLanes.map((lane) => {
                    const tx = PAD + lane * LANE_W;
                    return (
                      <line
                        key={`${commit.hash}-t-${lane}`}
                        x1={tx}
                        y1={y - ROW_H / 2}
                        x2={tx}
                        y2={y + ROW_H / 2}
                        stroke={laneColor(lane)}
                        strokeWidth={2}
                      />
                    );
                  })}
                  {commit.edges.map((edge, edgeIndex) => {
                    const x2 = PAD + edge.toLane * LANE_W;
                    const isMerge = edge.kind === "merge";
                    const c1y = y + 10;
                    const c2y = nextY - 10;
                    return (
                      <path
                        key={`${commit.hash}-e-${edgeIndex}`}
                        d={`M ${x} ${y} C ${x} ${c1y}, ${x2} ${c2y}, ${x2} ${nextY}`}
                        fill="none"
                        stroke={laneColor(isMerge ? edge.toLane : commit.lane)}
                        strokeWidth={2}
                      />
                    );
                  })}
                  <circle
                    cx={x}
                    cy={y}
                    r={head === commit.hash ? 6 : 4.5}
                    fill={laneColor(commit.lane)}
                    stroke={head === commit.hash ? "#e6edf3" : "none"}
                    strokeWidth={2}
                  />
                </g>
              );
            })}
          </svg>
          {commits.map((commit) => (
            <div
              key={commit.hash}
              className={`commit-row${selected === commit.hash ? " selected" : ""}`}
              onClick={() => onSelect(commit.hash)}
            >
              <div />
              <div className="commit-meta">
                <span className="hash">{commit.shortHash}</span>
                {head === commit.hash ? <span className="badge head">HEAD</span> : null}
                {commit.refs.map((ref) => (
                  <span key={ref} className={`badge${ref.includes("tag") ? " tag" : ""}`}>
                    {ref}
                  </span>
                ))}
                <span className="subject" title={commit.subject}>
                  {commit.subject}
                </span>
                <span className="muted">{commit.author}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
