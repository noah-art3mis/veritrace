import {
  BaseEdge,
  EdgeLabelRenderer,
  getStraightPath,
  useStore,
  type EdgeProps,
} from "@xyflow/react";

// Zoom-aware radial spoke/chord labels (#47). On a big radial graph the stance text and the
// "conflicts" chord label render on every spoke at once, which is dense noise when zoomed out.
// Keep the text — but fade it to nothing below ZOOM_FADE_START and ramp to full by ZOOM_FADE_END,
// so labels appear only as you zoom into a region. The stance/conflict COLOUR lives in the spoke
// stroke itself, so the non-colour text read is recoverable on zoom without losing the encoding.
const ZOOM_FADE_START = 0.6;
const ZOOM_FADE_END = 0.95;

interface RadialLabelData {
  label?: string;
  color?: string;
}

export function RadialLabelEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  style,
  markerEnd,
  data,
}: EdgeProps) {
  // s.transform is [x, y, zoom]; subscribing re-renders the edge as the viewport zooms.
  const zoom = useStore((s) => s.transform[2]);
  const [path, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  const d = (data ?? {}) as RadialLabelData;
  const opacity = Math.max(
    0,
    Math.min(1, (zoom - ZOOM_FADE_START) / (ZOOM_FADE_END - ZOOM_FADE_START)),
  );

  return (
    <>
      <BaseEdge path={path} style={style} markerEnd={markerEnd} />
      {d.label && opacity > 0.01 && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan"
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              opacity,
              pointerEvents: "none",
              background: "#0b0e15",
              color: d.color,
              fontSize: 9,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              padding: "2px 4px",
              borderRadius: 3,
              transition: "opacity 120ms linear",
            }}
          >
            {d.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

// Registered only for the radial view (the card view keeps React Flow's default labelled edges).
export const radialEdgeTypes = { radialLabel: RadialLabelEdge };
