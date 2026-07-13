import * as z from "zod";

const layoutId = "xxi-vek:title-slide";
const layoutName = "Титульный слайд";
const layoutDescription = "Титульный слайд с оранжевым акцентом и UPPERCASE-заголовком";

const Schema = z.object({
  title: z
    .string()
    .min(3)
    .max(120)
    .describe("Заголовок презентации (≤2 строки, макс 120 символов)"),
  subtitle: z
    .string()
    .max(200)
    .optional()
    .describe("Подзаголовок (опционально)"),
  author: z
    .string()
    .max(80)
    .optional()
    .describe("Автор / Компания"),
  date: z
    .string()
    .max(40)
    .optional()
    .describe("Дата"),
});

function dynamicSlideLayout({ data }: { data: any }) {
  const title = data?.title ?? "Презентация";
  const subtitle = data?.subtitle ?? "";
  const author = data?.author ?? "СК «21 век»";
  const date = data?.date ?? "";

  return (
    <div
      style={{
        width: 1280,
        height: 720,
        background: "#F3F4F5",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "flex-start",
        padding: "80px 100px",
        position: "relative",
        overflow: "hidden",
        fontFamily: "'Manrope', system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Diamond decor — top-right */}
      <svg
        style={{ position: "absolute", top: 0, right: 0, opacity: 0.15 }}
        width="240"
        height="240"
        viewBox="0 0 240 240"
      >
        {Array.from({ length: 5 }).map((_, row) =>
          Array.from({ length: 5 }).map((_, col) => (
            <rect
              key={`${row}-${col}`}
              x={12 + col * 44}
              y={12 + row * 44}
              width="28"
              height="28"
              rx="6"
              fill="#EC6608"
              opacity={0.3 + (row + col) * 0.08}
              transform={`rotate(45 ${26 + col * 44} ${26 + row * 44})`}
            />
          ))
        )}
      </svg>

      {/* Orange accent bar */}
      <div
        style={{
          width: 64,
          height: 4,
          background: "#EC6608",
          borderRadius: 2,
          marginBottom: 24,
        }}
      />

      {/* Title */}
      <h1
        style={{
          fontSize: "3.2rem",
          fontWeight: 900,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "#1A1A1A",
          margin: 0,
          marginBottom: 8,
          maxWidth: 900,
          lineHeight: 1.2,
          wordBreak: "break-word",
        }}
      >
        {title}
        <span style={{ color: "#EC6608" }}>.</span>
      </h1>

      {/* Subtitle */}
      {subtitle && (
        <p
          style={{
            fontSize: "1.4rem",
            color: "#6B6B6B",
            maxWidth: 700,
            lineHeight: 1.5,
            margin: 0,
            marginBottom: 32,
          }}
        >
          {subtitle}
        </p>
      )}

      {/* Author & Date footer */}
      <div
        style={{
          position: "absolute",
          bottom: 40,
          left: 100,
          fontSize: "0.8rem",
          color: "#6B6B6B",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {author}
        {date && ` · ${date}`}
      </div>
    </div>
  );
}

export { layoutId, layoutName, layoutDescription, Schema, dynamicSlideLayout };
