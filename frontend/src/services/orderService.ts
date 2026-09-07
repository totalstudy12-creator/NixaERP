export const orderService = {
  async getAll(params?: any) {
    return { data: { data: [] } };
  },
  async getById(id: number) {
    return { data: { id, customer_id: 0, customer: { name: '' } } };
  },
};