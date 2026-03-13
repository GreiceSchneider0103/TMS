import type { ReactNode } from 'react';
import { PrivateShell } from '@/components/PrivateShell';

export default function PrivateLayout({ children }: { children: ReactNode }) {
  return <PrivateShell>{children}</PrivateShell>;
}
