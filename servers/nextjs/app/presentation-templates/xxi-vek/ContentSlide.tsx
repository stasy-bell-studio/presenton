import * as z from "zod";

const layoutId = "xxi-vek:content-slide";
const layoutName = "Контентный слайд";
const layoutDescription = "Слайд с заголовком и маркированным списком. UPPERCASE-заголовок с оранжевой точкой.";

const bulletItem = z.object({
  text: z.string().min(5).max(250).describe("Текст пункта (мин 5, макс 250 символов)"),
  bold_lead: z.string().max(80).optional().describe("Жирное начало пункта"),
});

const Schema = z.object({
  heading: z
    .string()
    .min(3)
    .max(120)
    .describe("Заголовок слайда (≤2 строки, макс 120 символов)"),
  kicker: z
    .string()
    .max(60)
    .optional()
    .describe("Надзаголовок (KICKER)"),
  thesis: z
    .string()
    .max(300)
    .optional()
    .describe("Тезис под заголовком"),
  bullets: z
    .array(bulletItem)
    .min(2)
    .max(8)
    .describe("Пункты списка (мин 2, макс 8)"),
});

function dynamicSlideLayout({ data }: { data: any }) {
  const heading = data?.heading ?? "Заголовок";
  const kicker = data?.kicker ?? "";
  const thesis = data?.thesis ?? "";
  const bullets: Array<{ text: string; bold_lead?: string }> = data?.bullets ?? [
    { text: "Первый пункт" },
    { text: "Второй пункт" },
  ];

  return (
    <div
      style={{
        width: 1280,
        height: 720,
        background: "#F3F4F5",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-start",
        alignItems: "flex-start",
        padding: "80px 100px 40px",
        position: "relative",
        overflow: "hidden",
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Diamond decor — top-right */}
      <svg
        style={{ position: "absolute", top: 0, right: 0, opacity: 0.12 }}
        width="200"
        height="200"
        viewBox="0 0 200 200"
      >
        {Array.from({ length: 4 }).map((_, row) =>
          Array.from({ length: 4 }).map((_, col) => (
            <rect
              key={`${row}-${col}`}
              x={10 + col * 44}
              y={10 + row * 44}
              width="28"
              height="28"
              rx="6"
              fill="#EC6608"
              opacity={0.25 + (row + col) * 0.07}
              transform={`rotate(45 ${24 + col * 44} ${24 + row * 44})`}
            />
          ))
        )}
      </svg>

      {/* Kicker */}
      {kicker && (
        <div
          style={{
            fontSize: "0.75rem",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.16em",
            color: "#EC6608",
            marginBottom: 6,
            position: "relative",
            zIndex: 1,
          }}
        >
          {kicker}
        </div>
      )}

      {/* Heading */}
      <h2
        style={{
          fontSize: "2.4rem",
          fontWeight: 800,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          color: "#1A1A1A",
          margin: 0,
          marginBottom: 8,
          maxWidth: 900,
          lineHeight: 1.2,
          wordBreak: "break-word",
          position: "relative",
          zIndex: 1,
        }}
      >
        {heading}
        <span style={{ color: "#EC6608" }}>.</span>
      </h2>

      {/* Orange accent bar */}
      <div
        style={{
          width: 48,
          height: 3,
          background: "#EC6608",
          borderRadius: 2,
          marginBottom: 16,
          position: "relative",
          zIndex: 1,
        }}
      />

      {/* Thesis */}
      {thesis && (
        <p
          style={{
            fontSize: "1.15rem",
            color: "#6B6B6B",
            maxWidth: 900,
            lineHeight: 1.5,
            margin: 0,
            marginBottom: 20,
            position: "relative",
            zIndex: 1,
          }}
        >
          {thesis}
        </p>
      )}

      {/* Bullets */}
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          maxWidth: 900,
          position: "relative",
          zIndex: 1,
        }}
      >
        {bullets.map((item, i) => (
          <li
            key={i}
            style={{
              position: "relative",
              paddingLeft: "1.6rem",
              marginBottom: "0.75rem",
              fontSize: "1.25rem",
              lineHeight: 1.5,
              color: "#1A1A1A",
              wordBreak: "break-word",
            }}
          >
            <span
              style={{
                position: "absolute",
                left: 0,
                color: "#EC6608",
                fontSize: "0.9rem",
                top: "0.1rem",
              }}
            >
              ▸
            </span>
            {item.bold_lead && (
              <strong style={{ color: "#1A1A1A" }}>{item.bold_lead} </strong>
            )}
            {item.text}
          </li>
        ))}
      </ul>

      {/* Bottom-left diamond decor */}
      <svg
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          opacity: 0.08,
        }}
        width="140"
        height="140"
        viewBox="0 0 140 140"
      >
        {Array.from({ length: 3 }).map((_, row) =>
          Array.from({ length: 3 }).map((_, col) => (
            <rect
              key={`bl-${row}-${col}`}
              x={8 + col * 44}
              y={8 + row * 44}
              width="28"
              height="28"
              rx="6"
              fill="#EC6608"
              opacity={0.3 + (row + col) * 0.1}
              transform={`rotate(45 ${22 + col * 44} ${22 + row * 44})`}
            />
          ))
        )}
      </svg>
    </div>
  );
}

export { layoutId, layoutName, layoutDescription, Schema, dynamicSlideLayout };
