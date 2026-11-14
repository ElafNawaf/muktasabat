import { SkylineArt } from "@/components/site/SkylineArt";

/** Daylight skyline behind the login / password screens — same artwork as the website hero. */
export function LoginSky() {
  return (
    <div className="login-sky" aria-hidden="true">
      <SkylineArt />
    </div>
  );
}
