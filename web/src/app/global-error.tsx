"use client";

/** Last-resort screen when even the root layout fails. Plain HTML, no app CSS. */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="ar" dir="rtl">
      <body style={{ margin: 0, fontFamily: "Tahoma, Arial, sans-serif", background: "#FAF7F1", color: "#1F2328", display: "grid", placeItems: "center", minHeight: "100vh" }}>
        <div style={{ background: "#fff", border: "1px solid #E3DDD2", borderRadius: 14, padding: 32, maxWidth: 440, textAlign: "center" }}>
          <div style={{ background: "#7B1A1A", color: "#fff", borderRadius: 10, padding: "10px 14px", fontWeight: 700, marginBottom: 16 }}>شركة مكتسبات العقارية · Muktasabat</div>
          <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>تعذّر تحميل الصفحة</h1>
          <p style={{ color: "#5D636B", margin: "0 0 4px" }}>حدّث الصفحة للمتابعة.</p>
          <p dir="ltr" style={{ color: "#5D636B", margin: "0 0 18px" }}>Please reload the page to continue.</p>
          <button onClick={() => window.location.reload()} style={{ background: "#7B1A1A", color: "#fff", border: 0, borderRadius: 8, padding: "12px 24px", fontWeight: 700, cursor: "pointer" }}>
            تحديث · Reload
          </button>
          {error?.digest && <p dir="ltr" style={{ color: "#9a9ea4", fontSize: 12, marginTop: 16 }}>Ref: {error.digest}</p>}
        </div>
      </body>
    </html>
  );
}
