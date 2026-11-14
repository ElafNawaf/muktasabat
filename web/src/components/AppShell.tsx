"use client";

import { Sidebar } from "./Sidebar";
import { MobileNavBackdrop, MobileNavProvider } from "./MobileNavProvider";

export function AppShell({
  user,
  children,
}: {
  user: { username: string; role: string; full_name?: string | null; avatar_url?: string | null };
  children: React.ReactNode;
}) {
  return (
    <MobileNavProvider>
      <div className="app">
        <Sidebar user={user} />
        <div className="main">{children}</div>
        <MobileNavBackdrop />
      </div>
    </MobileNavProvider>
  );
}
