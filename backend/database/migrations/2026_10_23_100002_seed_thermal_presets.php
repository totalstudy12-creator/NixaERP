<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // Default Thermal Paper Profiles
        $paperProfiles = [
            [
                'name' => '50 × 30 mm Barcode Label (SEZNIK Josh 2")',
                'roll_type' => 'gap_labels',
                'paper_width_mm' => 58.00,
                'label_width_mm' => 50.00,
                'label_height_mm' => 30.00,
                'gap_mm' => 2.00,
                'margin_top_mm' => 1.00,
                'margin_bottom_mm' => 1.00,
                'margin_left_mm' => 2.00,
                'margin_right_mm' => 2.00,
                'orientation' => 'portrait',
                'labels_per_row' => 1,
                'is_preset' => true,
                'is_default' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'name' => '40 × 30 mm Compact Product Label',
                'roll_type' => 'gap_labels',
                'paper_width_mm' => 45.00,
                'label_width_mm' => 40.00,
                'label_height_mm' => 30.00,
                'gap_mm' => 2.00,
                'margin_top_mm' => 1.00,
                'margin_bottom_mm' => 1.00,
                'margin_left_mm' => 1.00,
                'margin_right_mm' => 1.00,
                'orientation' => 'portrait',
                'labels_per_row' => 1,
                'is_preset' => true,
                'is_default' => false,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'name' => '50 × 25 mm Shelf & Bin Tag',
                'roll_type' => 'gap_labels',
                'paper_width_mm' => 58.00,
                'label_width_mm' => 50.00,
                'label_height_mm' => 25.00,
                'gap_mm' => 2.00,
                'margin_top_mm' => 1.00,
                'margin_bottom_mm' => 1.00,
                'margin_left_mm' => 2.00,
                'margin_right_mm' => 2.00,
                'orientation' => 'portrait',
                'labels_per_row' => 1,
                'is_preset' => true,
                'is_default' => false,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'name' => '58 mm Thermal Receipt Roll',
                'roll_type' => 'continuous',
                'paper_width_mm' => 58.00,
                'label_width_mm' => 48.00,
                'label_height_mm' => 100.00,
                'gap_mm' => 0.00,
                'margin_top_mm' => 0.00,
                'margin_bottom_mm' => 0.00,
                'margin_left_mm' => 2.00,
                'margin_right_mm' => 2.00,
                'orientation' => 'portrait',
                'labels_per_row' => 1,
                'is_preset' => true,
                'is_default' => false,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'name' => '80 mm Thermal Receipt Roll',
                'roll_type' => 'continuous',
                'paper_width_mm' => 80.00,
                'label_width_mm' => 72.00,
                'label_height_mm' => 150.00,
                'gap_mm' => 0.00,
                'margin_top_mm' => 0.00,
                'margin_bottom_mm' => 0.00,
                'margin_left_mm' => 3.00,
                'margin_right_mm' => 3.00,
                'orientation' => 'portrait',
                'labels_per_row' => 1,
                'is_preset' => true,
                'is_default' => false,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'name' => '100 × 150 mm Shipping Carton Label (4×6")',
                'roll_type' => 'gap_labels',
                'paper_width_mm' => 104.00,
                'label_width_mm' => 100.00,
                'label_height_mm' => 150.00,
                'gap_mm' => 3.00,
                'margin_top_mm' => 2.00,
                'margin_bottom_mm' => 2.00,
                'margin_left_mm' => 2.00,
                'margin_right_mm' => 2.00,
                'orientation' => 'portrait',
                'labels_per_row' => 1,
                'is_preset' => true,
                'is_default' => false,
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ];

        foreach ($paperProfiles as $profile) {
            DB::table('thermal_paper_profiles')->updateOrInsert(
                ['name' => $profile['name']],
                $profile
            );
        }

        $defaultPaper = DB::table('thermal_paper_profiles')->where('name', 'like', '%SEZNIK%')->first();

        // Default Label Templates
        $elementsDefault = [
            ['id' => 'company_header', 'label' => 'Company Header', 'description' => 'Business & facility header branding', 'enabled' => true, 'posX' => 0, 'posY' => 0, 'fontSize' => 12, 'bold' => true],
            ['id' => 'product_title', 'label' => 'Product Name', 'description' => 'Full product item title & model', 'enabled' => true, 'posX' => 0, 'posY' => 0, 'fontSize' => 14, 'bold' => true],
            ['id' => 'sku_barcode', 'label' => 'SKU Barcode 1D', 'description' => 'Code 128 / EAN readable 1D barcode', 'enabled' => true, 'posX' => 0, 'posY' => 0, 'fontSize' => 10, 'bold' => false],
            ['id' => 'qr_code', 'label' => 'Direct QR Code 2D', 'description' => '2D quick-scan item verification code', 'enabled' => false, 'posX' => 0, 'posY' => 0, 'fontSize' => 8, 'bold' => false],
            ['id' => 'price_tag', 'label' => 'MRP & Selling Price', 'description' => 'Maximum Retail Price with tax breakdown', 'enabled' => true, 'posX' => 0, 'posY' => 0, 'fontSize' => 13, 'bold' => true],
            ['id' => 'bin_location', 'label' => 'Warehouse Bin / Bay', 'description' => 'Storage zone and pallet location', 'enabled' => true, 'posX' => 0, 'posY' => 0, 'fontSize' => 10, 'bold' => false],
            ['id' => 'expiry_batch', 'label' => 'Batch & Expiry Date', 'description' => 'Manufacturing lot and expiration', 'enabled' => true, 'posX' => 0, 'posY' => 0, 'fontSize' => 9, 'bold' => false],
            ['id' => 'custom_disclaimer', 'label' => 'Custom Note / Policy', 'description' => 'Returns policy or handling note', 'enabled' => true, 'posX' => 0, 'posY' => 0, 'fontSize' => 8, 'bold' => false],
        ];

        DB::table('label_templates')->updateOrInsert(
            ['name' => 'Standard Retail Product Label (50×30 mm)'],
            [
                'paper_profile_id' => $defaultPaper?->id,
                'width_mm' => 50.00,
                'height_mm' => 30.00,
                'dpi' => 203,
                'barcode_format' => 'Code 128',
                'barcode_height_mm' => 16.00,
                'thermal_heat' => 15,
                'print_speed_ips' => 4.0,
                'elements_config' => json_encode($elementsDefault),
                'company_name_override' => 'NEXA LOGISTICS',
                'facility_name_override' => 'Central Hub',
                'custom_note' => 'Handle with Care • Genuine Product',
                'is_default' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );

        DB::table('label_templates')->updateOrInsert(
            ['name' => 'Compact Jewelry / Cable Tag (40×30 mm)'],
            [
                'paper_profile_id' => null,
                'width_mm' => 40.00,
                'height_mm' => 30.00,
                'dpi' => 203,
                'barcode_format' => 'Code 128',
                'barcode_height_mm' => 12.00,
                'thermal_heat' => 16,
                'print_speed_ips' => 3.5,
                'elements_config' => json_encode($elementsDefault),
                'company_name_override' => 'NEXA ERP',
                'facility_name_override' => 'Retail Outlet',
                'custom_note' => 'Non-returnable if tag removed',
                'is_default' => false,
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );

        DB::table('label_templates')->updateOrInsert(
            ['name' => 'Warehouse Bin & Pallet Tag (50×25 mm)'],
            [
                'paper_profile_id' => null,
                'width_mm' => 50.00,
                'height_mm' => 25.00,
                'dpi' => 203,
                'barcode_format' => 'Code 128',
                'barcode_height_mm' => 10.00,
                'thermal_heat' => 15,
                'print_speed_ips' => 4.0,
                'elements_config' => json_encode($elementsDefault),
                'company_name_override' => 'NEXA WMS',
                'facility_name_override' => 'Zone A',
                'custom_note' => 'Internal Stock Only',
                'is_default' => false,
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        DB::table('label_templates')->whereIn('name', [
            'Standard Retail Product Label (50×30 mm)',
            'Compact Jewelry / Cable Tag (40×30 mm)',
            'Warehouse Bin & Pallet Tag (50×25 mm)',
        ])->delete();

        DB::table('thermal_paper_profiles')->where('is_preset', true)->delete();
    }
};
