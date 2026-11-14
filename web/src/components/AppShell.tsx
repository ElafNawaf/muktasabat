"use client";

import { CommandPalette } from "./CommandPalette";
import { MobileNavBackdrop, MobileNavProvider } from "./MobileNavProvider";
import { PortalNavProvider, type PortalUser } from "./PortalNav";
import { ResponsiveTables } from "./ResponsiveTables";
import { Sidebar } from "./Sidebar";

export function AppShell({ user, children }: { user: PortalUser; children: React.ReactNode }) {
  return (
    <MobileNavProvider>
      <PortalNavProvider user={user}>
        <div className="app">
          <Sidebar user={user} />
          <div className="main">{children}</div>
          <MobileNavBackdrop />
        </div>
        <CommandPalette />
        <ResponsiveTables />
      </PortalNavProvider>
    </MobileNavProvider>
  );
}
