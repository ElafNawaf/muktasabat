/** Re-mounts on every navigation: a short cross-fade shows the page changed. */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="route-fade">{children}</div>;
}
