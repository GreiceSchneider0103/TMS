import { ShipmentDetail } from '@/modules/shipments/ShipmentDetail';

export default function ShipmentDetailPage({ params }: { params: { id: string } }) {
  return <ShipmentDetail id={params.id} />;
}
