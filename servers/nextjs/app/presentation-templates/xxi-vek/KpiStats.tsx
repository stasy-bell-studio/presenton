import * as z from "zod";

const layoutId = "xxi-vek:kpi-stats";
const layoutName = "KPI / Статистика";
const layoutDescription = "Слайд с карточками KPI: оранжевые цифры, подписи, ромбовидный декор";

const kpiItem = z.object({
  value: z.string().min(1).max(20).describe("Значение KPI (цифра/текст)"),
  label: z.string().min(2).max(60).describe("Подпись под значением"),
  sublabel: z.string().max(80).optional().describe("Дополнительная подпись"),
});

const Schema = z.object({
  heading: z
    .string()
    .min(3)
    .max(120)
    .describe("Заголовок слайда (≤2 строки, макс 120 символов)"),
  kpis: z
    .array(kpiItem)
    .min(2)
    .max(6)
    .describe("Карточки KPI (мин 2, макс 6)"),
});

function dynamicSlideLayout({ data }: { data: any }) {
  const heading = data?.heading ?? "Ключевые показатели";
  const kpis: Array<{ value: string; label: string; sublabel?: string }> =
    data?.kpis ?? [
      { value: "85%", label: "Рост" },
      { value: "2.4×", label: "Эффективность" },
      { value: "12K", label: "Клиентов" },
    ];

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
        padding: "60px 80px",
        position: "relative",
        overflow: "hidden",
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Diamond decor */}
      <svg
        style={{ position: "absolute", top: 0, right: 0, opacity: 0.1 }}
        width="180"
        height="180"
        viewBox="0 0 180 180"
      >
        {Array.from({ length: 3 }).map((_, row) =>
          Array.from({ length: 3 }).map((_, col) => (
            <rect
              key={`${row}-${col}`}
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

      {/* Heading */}
      <h2
        style={{
          fontSize: "2.2rem",
          fontWeight: 800,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          color: "#1A1A1A",
          margin: 0,
          marginBottom: 40,
          maxWidth: 900,
          textAlign: "center",
          lineHeight: 1.2,
          wordBreak: "break-word",
          position: "relative",
          zIndex: 1,
        }}
      >
        {heading}
        <span style={{ color: "#EC6608" }}>.</span>
      </h2>

      {/* KPI cards */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 20,
          justifyContent: "center",
          maxWidth: 1000,
          position: "relative",
          zIndex: 1,
        }}
      >
        {kpis.map((kpi, i) => (
          <div
            key={i}
            style={{
              background: "#FFFFFF",
              border: "1px solid rgba(26,26,26,0.08)",
              borderRadius: 20,
              padding: "28px 32px",
              textAlign: "center",
              minWidth: 180,
              maxWidth: 280,
              flex: "1 1 180px",
              boxShadow: "0 8px 24px rgba(26,26,26,0.04)",
            }}
          >
            <div
              style={{
                fontSize: "2.8rem",
                fontWeight: 800,
                color: "#EC6608",
                lineHeight: 1.1,
                marginBottom: 6,
                wordBreak: "break-word",
              }}
            >
              {kpi.value}
            </div>
            <div
              style={{
                fontSize: "0.95rem",
                color: "#6B6B6B",
                textTransform: "uppercase",
                letterSpacing: "0.03em",
              }}
            >
              {kpi.label}
            </div>
            {kpi.sublabel && (
              <div
                style={{
                  fontSize: "0.8rem",
                  color: "#9CA3AF",
                  marginTop: 4,
                }}
              >
                {kpi.sublabel}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export { layoutId, layoutName, layoutDescription, Schema, dynamicSlideLayout };
