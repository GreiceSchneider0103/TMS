import { Suspense } from 'react';
import { CrudPanel } from '@/modules/settings/CrudPanel';

export default function CadastrosPage() {
  return (
    <Suspense>
      <CrudPanel />
    </Suspense>
  );
}
