import { ModernDataTable } from '../components/ModernDataTable';
export function ManualOrdersPage(){
  const columns = [{name:'Order', selector:(r:any)=>r.order_no},{name:'Customer', selector:(r:any)=>r.customer}];
  return (<div className="p-8 bg-gray-50 min-h-screen"><h1 className="text-3xl font-bold mb-4">Manual Orders</h1><ModernDataTable title="Manual Orders" columns={columns} data={[]} loading={false} /></div>);
}
