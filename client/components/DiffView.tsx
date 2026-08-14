import type { CSSProperties } from "react";

interface DiffViewProps {
  patch: string;
}

export function DiffView({ patch }: DiffViewProps) {
  if (!patch) {
    return <div className="muted">没有差异</div>;
  }
  return (
    <div className="diff">
      {patch.split("\n").map((line, index) => {
        let className = "";
        if (line.startsWith("+") && !line.startsWith("+++")) {
          className = "add";
        } else if (line.startsWith("-") && !line.startsWith("---")) {
          className = "del";
        } else if (line.startsWith("@@")) {
          className = "hunk";
        }
        return (
          <div key={index} className={className} style={{ minHeight: 16 } as CSSProperties}>
            {line || " "}
          </div>
        );
      })}
    </div>
  );
}
