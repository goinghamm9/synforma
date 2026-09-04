import { cn } from "@/lib/utils";

const STACK_HEIGHT = 384;
const STACK_WIDTH = 200;
const NODE_WIDTH = 156;
const NODE_HEIGHT = 34;
const PADDING = 4;

function Stack({ nodes, accent, label }: { nodes: string[]; accent?: boolean; label: string }) {
  const count = nodes.length;
  const gap = (STACK_HEIGHT - PADDING * 2 - count * NODE_HEIGHT) / (count - 1);
  const x = (STACK_WIDTH - NODE_WIDTH) / 2;
  const cx = STACK_WIDTH / 2;

  return (
    <svg
      viewBox={`0 0 ${STACK_WIDTH} ${STACK_HEIGHT}`}
      className="h-auto w-full"
      role="img"
      aria-label={label}
    >
      {nodes.map((node, index) => {
        const y = PADDING + index * (NODE_HEIGHT + gap);
        const lineStart = y + NODE_HEIGHT;
        const lineEnd = lineStart + gap;
        const isLast = index === count - 1;
        const emphasized = accent && node === "SYNFORMA";
        return (
          <g key={node}>
            {!isLast ? (
              <>
                <line
                  x1={cx}
                  y1={lineStart}
                  x2={cx}
                  y2={lineEnd - 4}
                  strokeWidth={1}
                  className={accent ? "flow-line stroke-ink" : "stroke-line-strong"}
                />
                <path
                  d={`M${cx - 3.5} ${lineEnd - 5} L${cx} ${lineEnd - 1} L${cx + 3.5} ${lineEnd - 5}`}
                  fill="none"
                  strokeWidth={1}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={accent ? "stroke-ink" : "stroke-line-strong"}
                />
              </>
            ) : null}
            <rect
              x={x}
              y={y}
              width={NODE_WIDTH}
              height={NODE_HEIGHT}
              rx={6}
              strokeWidth={1}
              className={cn(
                emphasized ? "fill-ink stroke-ink" : "fill-surface",
                !emphasized && (accent ? "stroke-ink" : "stroke-line-strong"),
              )}
            />
            <text
              x={cx}
              y={y + NODE_HEIGHT / 2}
              textAnchor="middle"
              dominantBaseline="central"
              className={cn(
                "font-mono text-[11px] tracking-[0.14em]",
                emphasized ? "fill-paper" : accent ? "fill-ink" : "fill-graphite",
              )}
            >
              {node}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

const LEGACY = ["HUMAN", "APPLICATION", "MENU", "PAGE", "FORM", "BUTTON", "DATABASE"];
const SYNFORMA = ["HUMAN", "INTENT", "SYNFORMA", "ACTION"];

/** Two stacks, side by side: the path work takes today versus the path through Synforma. */
export function HeroDiagram() {
  return (
    <figure className="dot-paper rounded-lg border border-line bg-surface p-5 sm:p-7">
      <div className="grid grid-cols-2 gap-5 sm:gap-8">
        <div>
          <p className="eyebrow mb-4">Legacy adoption</p>
          <Stack
            nodes={LEGACY}
            label="Legacy path: human, application, menu, page, form, button, database"
          />
        </div>
        <div>
          <p className="eyebrow mb-4 text-ink">Synforma</p>
          <Stack accent nodes={SYNFORMA} label="Synforma path: human, intent, Synforma, action" />
        </div>
      </div>
      <figcaption className="mt-6 grid grid-cols-2 gap-5 border-t border-line pt-4 text-xs leading-relaxed text-slate sm:gap-8">
        <p>Seven layers between a person and the outcome. Each has to be taught, tagged and maintained.</p>
        <p className="text-graphite">Intent is the interface. The application becomes an implementation detail.</p>
      </figcaption>
    </figure>
  );
}
