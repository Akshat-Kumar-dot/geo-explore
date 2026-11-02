import type { ReactNode } from 'react';
import AppTopBar from './AppTopBar';
import AppSidebar from './AppSidebar';
import { useUiStore } from '../../stores/uiStore';
import type { Screen } from '../../stores/chatStore';

/** Same frame on every screen: sidebar left, one top bar, content right. */
export default function AppShell({ screen, children }: { screen: Screen; children: ReactNode }) {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  return (
    <div className="h-full flex bg-canvas">
      {sidebarOpen && <AppSidebar screen={screen} />}
      <div className="flex-1 min-w-0 flex flex-col">
        <AppTopBar />
        <div className="flex-1 min-h-0 relative">{children}</div>
      </div>
    </div>
  );
}
