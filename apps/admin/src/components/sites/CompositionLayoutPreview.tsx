/** Declared rectangles only. No imported CSS, HTML, assets or component code executes. */
export function CompositionLayoutPreview({
  content,
}: {
  content: Record<string, any>;
}) {
  const canvas = content.canvasSize || content.canvas || {},
    width = finite(canvas.width, 1200),
    height = finite(canvas.height, 800),
    rows: Array<{
      id: string;
      type: string;
      x: number;
      y: number;
      width: number;
      height: number;
    }> = [];
  const walk = (elements: any[], offsetX = 0, offsetY = 0) => {
    for (const element of elements) {
      if (!element || typeof element !== "object" || rows.length >= 128)
        continue;
      const x = offsetX + finite(element.x, 0),
        y = offsetY + finite(element.y, 0);
      rows.push({
        id: String(element.id || "Unidentified"),
        type: String(element.type || "Unknown"),
        x,
        y,
        width: finite(element.width, 160),
        height: finite(element.height, 60),
      });
      if (Array.isArray(element.children)) walk(element.children, x, y);
    }
  };
  walk(
    Array.isArray(content.elements)
      ? content.elements
      : Array.isArray(content.contentDocument?.elements)
        ? content.contentDocument.elements
        : [],
  );
  if (!rows.length) return null;
  return (
    <figure className="mt-3 rounded-md border bg-background p-3">
      <figcaption className="mb-2 text-xs text-muted-foreground">
        Declared layout · {Math.round(width)} × {Math.round(height)} · first 128
        rectangles · flow and runtime measurements remain unverified
      </figcaption>
      <svg
        className="max-h-64 w-full"
        viewBox={`0 0 ${Math.max(1, width)} ${Math.max(1, height)}`}
        role="img"
        aria-label="Imported declared element rectangles"
      >
        <rect width={width} height={height} fill="#f8fafc" />
        {rows.map((row, index) => (
          <g key={`${row.id}:${index}`}>
            <rect
              x={row.x}
              y={row.y}
              width={Math.max(1, row.width)}
              height={Math.max(1, row.height)}
              fill="#0f766e"
              fillOpacity=".07"
              stroke="#0f766e"
              strokeWidth="1"
            />
            <text
              x={row.x + 6}
              y={row.y + 16}
              fill="#334155"
              fontSize="12"
            >{`${row.type} · ${row.id}`}</text>
          </g>
        ))}
      </svg>
    </figure>
  );
}
function finite(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(-100000, Math.min(100000, value))
    : fallback;
}
