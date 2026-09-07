import React, { useEffect, useState } from 'react';
import { Modal, Form, Input, DatePicker, Select, Button, Space, Table, InputNumber, message } from 'antd';
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { salesReturnService, SalesReturn, SalesReturnItem } from '../services/salesReturnService';
import { orderService } from '../services/orderService';
import { productService } from '../services/productService';
import { warehouseService } from '../services/warehouseService';

interface Props {
    visible: boolean;
    onCancel: () => void;
    onSuccess: () => void;
    initialValues?: SalesReturn;
}

const SalesReturnForm: React.FC<Props> = ({ visible, onCancel, onSuccess, initialValues }) => {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const [orders, setOrders] = useState<any[]>([]);
    const [warehouses, setWarehouses] = useState<any[]>([]);
    const [products, setProducts] = useState<any[]>([]);
    const [selectedOrder, setSelectedOrder] = useState<any>(null);

    const isEdit = !!initialValues?.id;

    useEffect(() => {
        if (visible) {
            fetchOptions();
            if (initialValues) {
                form.setFieldsValue({
                    ...initialValues,
                    return_date: dayjs(initialValues.return_date),
                    items: initialValues.items?.map((item: SalesReturnItem) => ({
                        ...item,
                        total_price: (item.quantity ?? 0) * (item.unit_price ?? 0),
                    })),
                });
                if (initialValues.order_id != null) {
                    orderService.getById(initialValues.order_id).then((res: any) => {
                        setSelectedOrder(res.data);
                        form.setFieldsValue({ customer_id: res.data.customer_id });
                    });
                }
            } else {
                form.resetFields();
                form.setFieldsValue({ items: [] });
            }
        }
    }, [visible, initialValues]);

    const fetchOptions = async () => {
        try {
            const [ordersRes, warehousesRes, productsRes] = await Promise.all([
                orderService.getAll({ per_page: 100 }),
                warehouseService.getAll({ per_page: 100 }),
                productService.getAll({ per_page: 100 }),
            ]);
            setOrders(ordersRes.data.data);
            setWarehouses(warehousesRes.data.data);
            setProducts(productsRes.data.data);
        } catch (error) {
            message.error('Failed to load options');
        }
    };

    const handleOrderChange = async (orderId: number) => {
        try {
            const res: any = await orderService.getById(orderId);
            setSelectedOrder(res.data);
            form.setFieldsValue({ customer_id: res.data.customer_id });
        } catch (error) {
            message.error('Failed to fetch order details');
        }
    };

    const onFinish = async (values: any) => {
        setLoading(true);
        try {
            const payload = {
                ...values,
                return_date: values.return_date.format('YYYY-MM-DD'),
                items: values.items.map((item: any) => ({
                    product_id: item.product_id,
                    quantity: item.quantity,
                    unit_price: item.unit_price,
                    reason: item.reason,
                })),
                customer_id: selectedOrder?.customer_id,
            };

            if (isEdit) {
                await salesReturnService.update(initialValues.id!, payload);
                message.success('Updated successfully');
            } else {
                await salesReturnService.create(payload);
                message.success('Created successfully');
            }
            onSuccess();
        } catch (error: any) {
            const errMsg = error.response?.data?.errors || error.response?.data?.error || 'Operation failed';
            message.error(typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg));
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            title={isEdit ? 'Edit Sales Return' : 'New Sales Return'}
            open={visible}
            onCancel={onCancel}
            footer={null}
            width={800}
            destroyOnClose
        >
            <Form form={form} layout="vertical" onFinish={onFinish}>
                <Form.Item name="order_id" label="Order" rules={[{ required: true, message: 'Please select an order' }]}>
                    <Select
                        placeholder="Select order"
                        onChange={handleOrderChange}
                        disabled={isEdit}
                        showSearch
                        optionFilterProp="children"
                    >
                        {orders.map(order => (
                            <Select.Option key={order.id} value={order.id}>
                                {order.order_number} - {order.customer?.name}
                            </Select.Option>
                        ))}
                    </Select>
                </Form.Item>

                <Form.Item name="customer_id" label="Customer">
                    <Input disabled value={selectedOrder?.customer?.name} />
                </Form.Item>

                <Form.Item name="warehouse_id" label="Warehouse" rules={[{ required: true, message: 'Select warehouse' }]}>
                    <Select placeholder="Select warehouse">
                        {warehouses.map(wh => (
                            <Select.Option key={wh.id} value={wh.id}>{wh.name}</Select.Option>
                        ))}
                    </Select>
                </Form.Item>

                <Form.Item name="return_date" label="Return Date" rules={[{ required: true }]}>
                    <DatePicker style={{ width: '100%' }} />
                </Form.Item>

                <Form.Item name="reason" label="Reason">
                    <Input.TextArea rows={2} />
                </Form.Item>

                <Form.Item name="notes" label="Notes">
                    <Input.TextArea rows={2} />
                </Form.Item>

                <Form.Item label="Items" required>
                    <Form.List name="items">
                        {(fields, { add, remove }) => (
                            <>
                                <Table
                                    dataSource={fields}
                                    pagination={false}
                                    rowKey="key"
                                    columns={[
                                        {
                                            title: 'Product',
                                            dataIndex: 'product_id',
                                            render: (_, field, index) => (
                                                <Form.Item
                                                    name={[field.name, 'product_id']}
                                                    rules={[{ required: true, message: 'Select product' }]}
                                                    noStyle
                                                >
                                                    <Select placeholder="Product" showSearch optionFilterProp="children">
                                                        {products.map(p => (
                                                            <Select.Option key={p.id} value={p.id}>{p.name}</Select.Option>
                                                        ))}
                                                    </Select>
                                                </Form.Item>
                                            ),
                                        },
                                        {
                                            title: 'Qty',
                                            dataIndex: 'quantity',
                                            render: (_, field, index) => (
                                                <Form.Item
                                                    name={[field.name, 'quantity']}
                                                    rules={[{ required: true, message: 'Qty required' }]}
                                                    noStyle
                                                >
                                                    <InputNumber min={1} style={{ width: '100%' }} />
                                                </Form.Item>
                                            ),
                                        },
                                        {
                                            title: 'Unit Price',
                                            dataIndex: 'unit_price',
                                            render: (_, field, index) => (
                                                <Form.Item
                                                    name={[field.name, 'unit_price']}
                                                    rules={[{ required: true, message: 'Price required' }]}
                                                    noStyle
                                                >
                                                    <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
                                                </Form.Item>
                                            ),
                                        },
                                        {
                                            title: 'Reason',
                                            dataIndex: 'reason',
                                            render: (_, field, index) => (
                                                <Form.Item name={[field.name, 'reason']} noStyle>
                                                    <Input placeholder="Reason" />
                                                </Form.Item>
                                            ),
                                        },
                                        {
                                            title: 'Action',
                                            render: (_, field, index) => (
                                                <MinusCircleOutlined
                                                    onClick={() => remove(field.name)}
                                                    style={{ color: 'red' }}
                                                />
                                            ),
                                        },
                                    ]}
                                />
                                <Button
                                    type="dashed"
                                    onClick={() => add()}
                                    block
                                    icon={<PlusOutlined />}
                                >
                                    Add Item
                                </Button>
                            </>
                        )}
                    </Form.List>
                </Form.Item>

                <Form.Item>
                    <Space>
                        <Button type="primary" htmlType="submit" loading={loading}>
                            {isEdit ? 'Update' : 'Create'}
                        </Button>
                        <Button onClick={onCancel}>Cancel</Button>
                    </Space>
                </Form.Item>
            </Form>
        </Modal>
    );
};

export default SalesReturnForm;