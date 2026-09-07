export const productService = {
  async getAll(params?: any) {
    return { data: { data: [] } };
  },
  async getById(id: number) {
    return { data: { id } };
  },
};