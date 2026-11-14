/* eslint-disable @next/next/no-img-element -- avatars come from S3/local uploads, not next/image domains */

/** Round user avatar: uploaded photo, else initials on the brand colour. */
export function UserAvatar({
  name,
  url,
  size = 32,
  className = "",
}: {
  name: string;
  url?: string | null;
  size?: number;
  className?: string;
}) {
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0] ?? "")
      .join("")
      .toUpperCase() || "?";
  const style: React.CSSProperties = {
    width: size,
    height: size,
    fontSize: Math.max(11, Math.round(size * 0.38)),
    flexShrink: 0,
  };
  if (url) {
    return <img src={url} alt="" className={"avatar avatar-img " + className} style={style} />;
  }
  return (
    <div className={"avatar " + className} style={style} aria-hidden>
      {initials}
    </div>
  );
}
