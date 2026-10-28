<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (!Schema::hasTable('connected_apps')) {
            Schema::create('connected_apps', function (Blueprint $table) {
                $table->id();
                $table->string('name', 120);
                $table->string('app_identifier', 80)->unique();
                $table->text('description')->nullable();
                $table->string('category', 50)->default('custom'); // wms, ai_agent, billing, custom
                $table->string('platform', 50)->default('flutter'); // flutter, android, ios, web
                $table->string('current_version', 30)->default('1.0.0');
                $table->string('min_supported_version', 30)->default('1.0.0');
                $table->boolean('force_update')->default(false);
                $table->string('apk_download_url', 500)->nullable();
                $table->text('release_notes')->nullable();
                $table->boolean('is_active')->default(true);
                $table->boolean('maintenance_mode')->default(false);
                $table->text('maintenance_message')->nullable();
                $table->string('api_key', 64)->unique();
                $table->json('allowed_roles')->nullable();
                $table->json('settings')->nullable();
                $table->timestamp('last_sync_at')->nullable();
                $table->timestamps();
            });

            // Seed initial 3 Flutter applications
            $defaultApps = [
                [
                    'name' => 'Nixa WMS',
                    'app_identifier' => 'nixa_wms',
                    'description' => 'Warehouse Management System Mobile App — Barcode/QR scanning, stock receiving, bin movements, physical counts, and transfer dispatches.',
                    'category' => 'wms',
                    'platform' => 'flutter',
                    'current_version' => '1.2.3',
                    'min_supported_version' => '1.0.0',
                    'force_update' => false,
                    'apk_download_url' => 'https://downloads.nixaerp.com/apps/nixa-wms-v1.2.3.apk',
                    'release_notes' => 'Initial Flutter release with offline scan cache and warehouse transfer tracking.',
                    'is_active' => true,
                    'maintenance_mode' => false,
                    'maintenance_message' => 'Nixa WMS is undergoing scheduled sync maintenance. Please check back shortly.',
                    'api_key' => 'nixa_wms_' . Str::random(40),
                    'allowed_roles' => json_encode(['Admin', 'Warehouse Manager', 'Warehouse Staff', 'Super Admin']),
                    'settings' => json_encode([
                        'scanner_vibration' => true,
                        'continuous_scan' => true,
                        'auto_submit_grn' => false,
                    ]),
                    'last_sync_at' => now(),
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
                [
                    'name' => 'Nixa AI Agent',
                    'app_identifier' => 'nixa_ai_agent',
                    'description' => 'Mobile AI Voice & Executive Copilot — Hands-free conversational voice commands, real-time sales/inventory telemetry, and executive KPI summaries.',
                    'category' => 'ai_agent',
                    'platform' => 'flutter',
                    'current_version' => '1.2.3',
                    'min_supported_version' => '1.0.0',
                    'force_update' => false,
                    'apk_download_url' => 'https://downloads.nixaerp.com/apps/nixa-ai-v1.2.3.apk',
                    'release_notes' => 'Gemini 3.8 Live bidirectional voice integration with offline learning memory.',
                    'is_active' => true,
                    'maintenance_mode' => false,
                    'maintenance_message' => 'AI voice agent models are updating. Standard text chat remains available.',
                    'api_key' => 'nixa_ai_' . Str::random(40),
                    'allowed_roles' => json_encode(['Admin', 'Super Admin', 'Director', 'Sales Manager']),
                    'settings' => json_encode([
                        'voice_persona' => 'Aoede',
                        'voice_speed' => 1.0,
                        'auto_listen_after_response' => true,
                    ]),
                    'last_sync_at' => now(),
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
                [
                    'name' => 'Nixa Billing',
                    'app_identifier' => 'nixa_billing',
                    'description' => 'Point of Sale (POS), Invoicing & Thermal Printing App — Fast multi-counter billing, customer ledger, Bluetooth 58mm/80mm printing, and instant payment recording.',
                    'category' => 'billing',
                    'platform' => 'flutter',
                    'current_version' => '1.2.3',
                    'min_supported_version' => '1.0.0',
                    'force_update' => false,
                    'apk_download_url' => 'https://downloads.nixaerp.com/apps/nixa-billing-v1.2.3.apk',
                    'release_notes' => 'Multi-format thermal printing support (58mm, 80mm) with one-click direct printout.',
                    'is_active' => true,
                    'maintenance_mode' => false,
                    'maintenance_message' => 'Billing server sync is temporarily paused for tax table updates.',
                    'api_key' => 'nixa_pos_' . Str::random(40),
                    'allowed_roles' => json_encode(['Admin', 'Cashier', 'Sales Representative', 'Super Admin']),
                    'settings' => json_encode([
                        'default_printer_format' => '80mm',
                        'auto_print_on_sale' => true,
                        'allow_credit_sales' => true,
                    ]),
                    'last_sync_at' => now(),
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
            ];

            DB::table('connected_apps')->insert($defaultApps);
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('connected_apps');
    }
};
