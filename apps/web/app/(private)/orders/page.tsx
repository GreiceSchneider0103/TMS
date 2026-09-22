import { Suspense } from 'react';
import { OrdersList } from '@/modules/orders/OrdersList';

export default function OrdersPage() {
  return (
    <Suspense>
      <OrdersList />
    </Suspense>
  );
}
