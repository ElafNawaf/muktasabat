/**
 * The employment contract as a document: bilingual letterhead with the company logo,
 * structured clauses, signature blocks and a fingerprint. Same markup on screen,
 * in the template preview and when printed / saved as PDF.
 */

export type Letterhead = {
  name_ar: string; name_en?: string | null; cr?: string | null; color?: string | null; logo_url?: string | null; is_holding?: boolean; code?: string | null;
};
export type SignBlock = { label: string; name?: string | null; role?: string | null; signature?: string | null; at?: string | null; pending: string };

type Block =
  | { k: "title"; text: string }
  | { k: "meta"; text: string }
  | { k: "clause"; num?: string; text: string }
  | { k: "li"; text: string }
  | { k: "p"; text: string };

const AR = /[؀-ۿ]/;
const CLAUSE = /^(?:(البند|المادة)\s*\(?\s*([\d٠-٩]+)\s*\)?|(Clause|Article|Section)\s+(\d+)[.:)]?)\s*[:\-–]?\s*(.*)$/i;
const SIGN_LINE = /_{4,}/;

function parse(section: string): Block[] {
  const lines = section.split("\n").map((l) => l.trim());
  const out: Block[] = [];
  let titled = false;
  for (const line of lines) {
    if (!line) continue;
    if (SIGN_LINE.test(line)) continue; // signature lines are drawn as proper blocks below
    if (!titled) { out.push({ k: "title", text: line }); titled = true; continue; }
    const m = line.match(CLAUSE);
    if (m) { out.push({ k: "clause", num: m[2] || m[4], text: (m[5] || "").trim() || line }); continue; }
    if (/^[-•·]\s+/.test(line)) { out.push({ k: "li", text: line.replace(/^[-•·]\s+/, "") }); continue; }
    if (out.length <= 2 && /^(رقم العقد|Contract (no|number))/i.test(line)) { out.push({ k: "meta", text: line }); continue; }
    out.push({ k: "p", text: line });
  }
  return out;
}

function Section({ text }: { text: string }) {
  const blocks = parse(text);
  const dir = AR.test(text.slice(0, 400)) ? "rtl" : "ltr";
  const nodes: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = (key: string) => { if (list.length) { nodes.push(<ul key={key} className="cp-list">{list.map((x, i) => <li key={i}>{x}</li>)}</ul>); list = []; } };
  blocks.forEach((b, i) => {
    if (b.k !== "li") flush(`l${i}`);
    if (b.k === "title") nodes.push(<h2 key={i} className="cp-title">{b.text}</h2>);
    else if (b.k === "meta") nodes.push(<p key={i} className="cp-meta">{b.text}</p>);
    else if (b.k === "clause") nodes.push(<h3 key={i} className="cp-clause">{b.num && <span className="cp-clause__n">{b.num}</span>}<span>{b.text}</span></h3>);
    else if (b.k === "li") list.push(b.text);
    else nodes.push(<p key={i} className="cp-p">{b.text}</p>);
  });
  flush("end");
  return <section className="cp-section" dir={dir} lang={dir === "rtl" ? "ar" : "en"}>{nodes}</section>;
}

export function CompanyMark({ head, size = 64 }: { head: Letterhead; size?: number }) {
  if (head.logo_url) return <img className="cp-logo" src={head.logo_url} alt="" style={{ height: size, maxWidth: size * 2.6 }} />;
  if (head.is_holding) return <img className="cp-logo" src="/brand/logo-512.png" alt="" style={{ height: size, width: size }} />;
  return (
    <span className="cp-logo cp-logo--mono" style={{ width: size, height: size, background: head.color || "#7B1A1A" }} aria-hidden>
      {(head.code || head.name_en || head.name_ar).slice(0, 2).toUpperCase()}
    </span>
  );
}

export function ContractPaper({
  ar, head, number, kind, issued, facts = [], body, watermark, sign, fingerprint,
}: {
  ar: boolean; head: Letterhead | null; number?: string | null; kind?: string | null; issued?: string | null;
  facts?: { label: string; value: React.ReactNode }[]; body: string; watermark?: string | null;
  sign?: { company: SignBlock; employee: SignBlock } | null; fingerprint?: string | null;
}) {
  const T = (a: string, e: string) => (ar ? a : e);
  const sections = body.split(/\n\s*[─—-]{6,}\s*\n/).map((s) => s.trim()).filter(Boolean);
  const accent = head?.color || "#7B1A1A";
  return (
    <article className="cp" style={{ "--cp-accent": accent } as React.CSSProperties}>
      {watermark && <div className="cp-watermark" aria-hidden>{watermark}</div>}
      {head && (
        <header className="cp-head">
          <div className="cp-head__ar" dir="rtl">
            <strong>{head.name_ar}</strong>
            {head.cr && <span>سجل تجاري {head.cr}</span>}
          </div>
          <CompanyMark head={head} />
          <div className="cp-head__en" dir="ltr">
            <strong>{head.name_en || head.name_ar}</strong>
            {head.cr && <span>C.R. {head.cr}</span>}
          </div>
        </header>
      )}
      <div className="cp-band">
        <span>{T("عقد عمل", "Employment contract")}{kind ? ` · ${kind}` : ""}</span>
        {number && <b dir="ltr">{number}</b>}
        {issued && <span dir="ltr">{issued}</span>}
      </div>
      {facts.length > 0 && (
        <dl className="cp-facts">
          {facts.map((f, i) => <div key={i}><dt>{f.label}</dt><dd>{f.value || "—"}</dd></div>)}
        </dl>
      )}
      {sections.map((s, i) => <Section key={i} text={s} />)}
      {sign && (
        <div className="cp-sign">
          {[sign.company, sign.employee].map((b, i) => (
            <div key={i} className={`cp-sign__box ${b.signature ? "is-signed" : ""}`}>
              <span className="cp-sign__label">{b.label}</span>
              <div className="cp-sign__ink">{b.signature ? <img src={b.signature} alt={T(`توقيع ${b.name ?? ""}`, `Signature of ${b.name ?? ""}`)} /> : <span className="cp-sign__pending">{b.pending}</span>}</div>
              <div className="cp-sign__who">
                <b>{b.name || "—"}</b>
                {b.role && <span>{b.role}</span>}
                {b.at && <span dir="ltr">{b.at}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
      <footer className="cp-foot">
        <span>{head ? `${head.name_ar}${head.name_en ? ` · ${head.name_en}` : ""}` : ""}</span>
        {fingerprint && <span className="cp-foot__fp" title={T("بصمة المستند (SHA-256) لحظة التوقيع — أي تعديل لاحق يغيّرها", "Document fingerprint (SHA-256) at signing — any later change alters it")}>
          <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden><path fill="#1f7a4d" d="M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3zm-1.2 14.2-3.5-3.5 1.4-1.4 2.1 2.1 4.9-4.9 1.4 1.4-6.3 6.3z" /></svg>{T("بصمة المستند", "Fingerprint")} <code dir="ltr">{fingerprint.slice(0, 16).toUpperCase().replace(/(.{4})/g, "$1 ").trim()}</code>
        </span>}
      </footer>
    </article>
  );
}
