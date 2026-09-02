<?php
// Quick test to see what the purchase creation endpoint returns

require 'vendor/autoload.php';
require 'bootstrap/app.php';

use App\Models\PurchaseInvoice;
use Illuminate\Support\Facades\DB;

$app->make('Illuminate\Contracts\Console\Kernel')->bootstrap();

$payload = [
    'purchase_number' => 'TEST-' . uniqid(),
    'supplier_id' => 1,
    'purchase_date' => '2026-08-06',
    'due_date' => '2026-08-06',
    'company_id' => 1,
    'warehouse' => 'Main Warehouse',
    'items' => [
        [
            'product_id' => 1,
            'product_name' => 'Test Item 1',
            'unit' => 'PCS',
            'quantity' => 168,
            'purchase_price' => 202.12,
            'discount_type' => 'percent',
            'discount_percent' => 0,
            'gst_slab' => 18,
            'is_inter_state' => false,
            'cgst_percent' => 9,
            'sgst_percent' => 9,
            'igst_percent' => 0,
        ],
    ]
];

try {
    // Simulate the create request
    $controller = new \App\Http\Controllers\Api\PurchaseInvoiceController();
    
    // Create a fake request
    $request = new \Illuminate\Http\Request();
    $request->merge($payload);
    
    // Call store method
    $response = $controller->store($request);
    
    // Get the actual response content
    if (method_exists($response, 'getContent')) {
        $content = $response->getContent();
        $decoded = json_decode($content, true);
        
        echo "=== BACKEND RESPONSE ===\n";
        echo json_encode($decoded, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";
        echo "\n=== KEY ANALYSIS ===\n";
        echo "Top-level keys: " . implode(', ', array_keys($decoded)) . "\n";
        echo "Has 'id': " . (isset($decoded['id']) ? 'YES (' . $decoded['id'] . ')' : 'NO') . "\n";
        echo "Has 'purchase_id': " . (isset($decoded['purchase_id']) ? 'YES (' . $decoded['purchase_id'] . ')' : 'NO') . "\n";
        echo "Has 'data': " . (isset($decoded['data']) ? 'YES (type: ' . gettype($decoded['data']) . ')' : 'NO') . "\n";
        
        if (isset($decoded['data']) && is_array($decoded['data'])) {
            echo "Data has 'id': " . (isset($decoded['data']['id']) ? 'YES (' . $decoded['data']['id'] . ')' : 'NO') . "\n";
        }
    }
} catch (\Exception $e) {
    echo "ERROR: " . $e->getMessage() . "\n";
    echo "File: " . $e->getFile() . "\n";
    echo "Line: " . $e->getLine() . "\n";
}
