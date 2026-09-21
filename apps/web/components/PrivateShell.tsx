import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';

export function PrivateShell({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
