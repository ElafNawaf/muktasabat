/** Inner-page header band. */
export function PageHead({ title, lead, children }: { title: string; lead?: string | null; children?: React.ReactNode }) {
  return (
    <section className="mk-pagehead">
      <div className="mk-wrap">
        <h1>{title}</h1>
        {lead && <p className="mk-lead">{lead}</p>}
        {children}
      </div>
    </section>
  );
}
