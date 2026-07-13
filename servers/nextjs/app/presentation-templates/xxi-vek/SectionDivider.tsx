import * as z from "zod";

const layoutId = "xxi-vek:section-divider";
const layoutName = "Разделитель";
const layoutDescription = "Слайд-разделитель с крупным UPPERCASE-заголовком и оранжевым акцентом";

const Schema = z.object({
  section_title: z
    .string()
    .min(2)
    .max(80)
    .describe("Название раздела (≤2 строки, макс 80 символов)"),
  section_number: z
    .string()
    .max(20)
    .optional()
    .describe("Номер раздела (напр. «01»)"),
});

function dynamicSlideLayout({ data }: { data: any }) {
  const title = data?.section_title ?? "Раздел";
  const number = data?.section_number ?? "";

  return (
    <div
      style={{
        width: 1280,
        height: 720,
        background: "#F3F4F5",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        padding: "80px 100px",
        position: "relative",
        overflow: "hidden",
        fontFamily: "'Manrope', system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Mesh background */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 70% 50% at 50% 50%, rgba(236,102,8,0.04), transparent 70%)",
          zIndex: 0,
        }}
      />

      {/* Diamond decor — all corners */}
      <svg
        style={{ position: "absolute", top: 0, right: 0, opacity: 0.12 }}
        width="180"
        height="180"
        viewBox="0 0 180 180"
      >
        {Array.from({ length: 3 }).map((_, row) =>
          Array.from({ length: 3 }).map((_, col) => (
            <rect
              key={`tr-${row}-${col}`}
              x={10 + col * 50}
              y={10 + row * 50}
              width="34"
              height="34"
              rx="7"
              fill="#EC6608"
              opacity={0.3 + (row + col) * 0.08}
              transform={`rotate(45 ${27 + col * 50} ${27 + row * 50})`}
            />
          ))
        )}
      </svg>

      {/* Section number */}
      {number && (
        <div
          style={{
            fontSize: "1rem",
            fontWeight: 700,
            color: "#EC6608",
            textTransform: "uppercase",
            letterSpacing: "0.2em",
            marginBottom: 16,
            position: "relative",
            zIndex: 1,
          }}
        >
          {number}
        </div>
      )}

      {/* Section title */}
      <h1
        style={{
          fontSize: "4rem",
          fontWeight: 900,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "#1A1A1A",
          margin: 0,
          maxWidth: 900,
          textAlign: "center",
          lineHeight: 1.15,
          wordBreak: "break-word",
          position: "relative",
          zIndex: 1,
        }}
      >
        {title}
        <span style={{ color: "#EC6608" }}>.</span>
      </h1>

      {/* Orange accent bar */}
      <div
        style={{
          width: 80,
          height: 4,
          background: "#EC6608",
          borderRadius: 2,
          marginTop: 24,
          position: "relative",
          zIndex: 1,
        }}
      />
    </div>
  );
}

export { layoutId, layoutName, layoutDescription, Schema, dynamicSlideLayout };
