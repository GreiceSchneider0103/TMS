import { OrderDetail } from '@/modules/orders/OrderDetail';

export default function OrderDetailPage({ params }: { params: { id: string } }) {
  return <OrderDetail id={params.id} />;
}
