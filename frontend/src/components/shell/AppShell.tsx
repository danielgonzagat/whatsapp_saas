'use client';

import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

// -------------- DESIGN TOKENS --------------
const COLORS = {
  bg: '#050608',
};

// -------------- PROPS --------------
interface AppShellProps {
  children: ReactNode;
  /** Active navigation item */
  activeNav?: string;
}

// -------------- COMPONENT --------------
export function AppShell({ children, activeNav }: AppShellProps) {
  return (
    <div
      className="min-h-screen flex"
      style={{ backgroundColor: COLORS.bg }}
    >
      {/* Sidebar */}
      <Sidebar activeItem={activeNav} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col ml-16">
        {/* Topbar */}
        <Topbar />

        {/* Page Content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
