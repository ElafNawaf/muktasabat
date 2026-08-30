"use client";

import { Sidebar } from "./Sidebar";
import { MobileNavBackdrop, MobileNavProvider } from "./MobileNavProvider";

export function AppShell({
  user,
  badges,
  children,
}: {
  user: { username: string; role: string };
  badges?: { payments?: number };
  children: React.ReactNode;
}) {
  return (
    <MobileNavProvider>
      <div className="app">
        <Sidebar user={user} badges={badges} />
        <div className="main">{children}</div>
        <MobileNavBackdrop />
      </div>
    </MobileNavProvider>
  );
}
