import * as z from "zod";

const layoutId = "xxi-vek:final-slide";
const layoutName = "Финальный слайд";
const layoutDescription = "Завершающий слайд с контактами и логотипом «21 век»";

const Schema = z.object({
  call_to_action: z
    .string()
    .min(5)
    .max(200)
    .describe("Призыв к действию / итоговая фраза"),
  contact_name: z
    .string()
    .max(80)
    .optional()
    .describe("Контактное лицо"),
  contact_phone: z
    .string()
    .max(30)
    .optional()
    .describe("Телефон"),
  contact_email: z
    .string()
    .max(60)
    .optional()
    .describe("Email"),
  company: z
    .string()
    .max(80)
    .optional()
    .describe("Название компании"),
});

function dynamicSlideLayout({ data }: { data: any }) {
  const cta = data?.call_to_action ?? "Спасибо за внимание";
  const contactName = data?.contact_name ?? "";
  const contactPhone = data?.contact_phone ?? "";
  const contactEmail = data?.contact_email ?? "";
  const company = data?.company ?? "СК «21 век»";

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
      {/* Diamond field background */}
      <svg
        style={{ position: "absolute", inset: 0, opacity: 0.06, width: "100%", height: "100%" }}
        viewBox="0 0 1280 720"
      >
        {Array.from({ length: 28 }).map((_, row) =>
          Array.from({ length: 14 }).map((_, col) => (
            <rect
              key={`${row}-${col}`}
              x={col * 90 + (row % 2) * 45}
              y={row * 45}
              width="30"
              height="30"
              rx="6"
              fill="#EC6608"
              opacity={0.15 + ((row + col) % 3) * 0.08}
              transform={`rotate(45 ${col * 90 + (row % 2) * 45 + 15} ${row * 45 + 15})`}
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
          position: "relative",
          zIndex: 1,
        }}
      />

      {/* CTA */}
      <h2
        style={{
          fontSize: "2.5rem",
          fontWeight: 800,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          color: "#1A1A1A",
          margin: 0,
          marginBottom: 32,
          maxWidth: 800,
          textAlign: "center",
          lineHeight: 1.3,
          wordBreak: "break-word",
          position: "relative",
          zIndex: 1,
        }}
      >
        {cta}
        <span style={{ color: "#EC6608" }}>.</span>
      </h2>

      {/* Contact info */}
      {(contactName || contactPhone || contactEmail) && (
        <div
          style={{
            textAlign: "center",
            marginBottom: 40,
            position: "relative",
            zIndex: 1,
          }}
        >
          {contactName && (
            <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#1A1A1A", marginBottom: 4 }}>
              {contactName}
            </div>
          )}
          {contactPhone && (
            <div style={{ fontSize: "0.95rem", color: "#6B6B6B" }}>{contactPhone}</div>
          )}
          {contactEmail && (
            <div style={{ fontSize: "0.95rem", color: "#EC6608" }}>{contactEmail}</div>
          )}
        </div>
      )}

      {/* Company */}
      <div
        style={{
          fontSize: "0.9rem",
          color: "#6B6B6B",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          position: "relative",
          zIndex: 1,
        }}
      >
        {company}
      </div>
    </div>
  );
}

export { layoutId, layoutName, layoutDescription, Schema, dynamicSlideLayout };
