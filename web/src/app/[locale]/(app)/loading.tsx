/** Skeleton shown while a portal page loads its data (instead of a blank screen). */
export default function Loading() {
  return (
    <div className="skel-page" aria-busy="true" aria-live="polite">
      <div className="skel-topbar" />
      <div className="page">
        <div className="skel-head">
          <div className="skel skel-title" />
          <div className="skel skel-line" style={{ width: "34%" }} />
        </div>
        <div className="skel-kpis">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skel-card">
              <div className="skel skel-line" style={{ width: "40%" }} />
              <div className="skel skel-num" />
            </div>
          ))}
        </div>
        <div className="skel-card skel-table">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skel-row">
              <div className="skel skel-line" style={{ width: `${30 + ((i * 17) % 40)}%` }} />
              <div className="skel skel-line" style={{ width: "14%" }} />
              <div className="skel skel-line" style={{ width: "10%" }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
