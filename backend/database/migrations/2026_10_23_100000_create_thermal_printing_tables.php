<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // 1. Printer Profiles
        Schema::create('printer_profiles', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->nullable()->index();
            $table->unsignedBigInteger('branch_id')->nullable()->index();
            $table->string('name');
            $table->string('bluetooth_mac')->nullable()->index();
            $table->string('protocol', 20)->default('TSPL'); // TSPL, ESCPOS, ZPL, CPCL
            $table->string('connection_type', 30)->default('bluetooth_classic'); // bluetooth_classic, ble, usb, network
            $table->integer('paper_width_mm')->default(58);
            $table->integer('dpi')->default(203);
            $table->integer('density')->default(15);
            $table->decimal('print_speed', 4, 1)->default(4.0);
            $table->string('purpose', 50)->default('all'); // all, product_labels, barcode_labels, receipts
            $table->boolean('is_default')->default(false);
            $table->string('status', 30)->default('offline');
            $table->unsignedBigInteger('created_by')->nullable()->index();
            $table->timestamps();

            $table->foreign('company_id')->references('id')->on('companies')->nullOnDelete();
            $table->foreign('branch_id')->references('id')->on('branches')->nullOnDelete();
            $table->foreign('created_by')->references('id')->on('users')->nullOnDelete();
        });

        // 2. Thermal Paper Profiles
        Schema::create('thermal_paper_profiles', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->nullable()->index();
            $table->unsignedBigInteger('branch_id')->nullable()->index();
            $table->string('name');
            $table->string('roll_type', 30)->default('gap_labels'); // continuous, gap_labels, black_mark
            $table->decimal('paper_width_mm', 6, 2)->default(58.00);
            $table->decimal('label_width_mm', 6, 2)->default(50.00);
            $table->decimal('label_height_mm', 6, 2)->default(30.00);
            $table->decimal('gap_mm', 6, 2)->default(2.00);
            $table->decimal('margin_top_mm', 6, 2)->default(0.00);
            $table->decimal('margin_bottom_mm', 6, 2)->default(0.00);
            $table->decimal('margin_left_mm', 6, 2)->default(0.00);
            $table->decimal('margin_right_mm', 6, 2)->default(0.00);
            $table->string('orientation', 20)->default('portrait'); // portrait, landscape
            $table->integer('labels_per_row')->default(1);
            $table->boolean('is_preset')->default(false);
            $table->boolean('is_default')->default(false);
            $table->unsignedBigInteger('created_by')->nullable()->index();
            $table->timestamps();

            $table->foreign('company_id')->references('id')->on('companies')->nullOnDelete();
            $table->foreign('branch_id')->references('id')->on('branches')->nullOnDelete();
            $table->foreign('created_by')->references('id')->on('users')->nullOnDelete();
        });

        // 3. Label Templates
        Schema::create('label_templates', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->nullable()->index();
            $table->unsignedBigInteger('branch_id')->nullable()->index();
            $table->unsignedBigInteger('paper_profile_id')->nullable()->index();
            $table->string('name');
            $table->decimal('width_mm', 6, 2)->default(50.00);
            $table->decimal('height_mm', 6, 2)->default(30.00);
            $table->integer('dpi')->default(203);
            $table->string('barcode_format', 30)->default('Code 128');
            $table->decimal('barcode_height_mm', 6, 2)->default(16.00);
            $table->integer('thermal_heat')->default(15);
            $table->decimal('print_speed_ips', 4, 1)->default(4.0);
            $table->json('elements_config')->nullable();
            $table->string('company_name_override')->nullable();
            $table->string('facility_name_override')->nullable();
            $table->text('custom_note')->nullable();
            $table->boolean('is_default')->default(false);
            $table->unsignedBigInteger('created_by')->nullable()->index();
            $table->timestamps();

            $table->foreign('company_id')->references('id')->on('companies')->nullOnDelete();
            $table->foreign('branch_id')->references('id')->on('branches')->nullOnDelete();
            $table->foreign('paper_profile_id')->references('id')->on('thermal_paper_profiles')->nullOnDelete();
            $table->foreign('created_by')->references('id')->on('users')->nullOnDelete();
        });

        // 4. Print Jobs
        Schema::create('print_jobs', function (Blueprint $table) {
            $table->id();
            $table->string('job_number', 50)->unique();
            $table->unsignedBigInteger('company_id')->nullable()->index();
            $table->unsignedBigInteger('branch_id')->nullable()->index();
            $table->unsignedBigInteger('user_id')->nullable()->index();
            $table->unsignedBigInteger('printer_profile_id')->nullable()->index();
            $table->string('printer_name');
            $table->unsignedBigInteger('template_id')->nullable()->index();
            $table->string('template_name');
            $table->integer('total_labels')->default(1);
            $table->integer('printed_labels')->default(0);
            $table->string('status', 30)->default('queued'); // draft, queued, connecting, sending, sent_to_printer, completed, failed, cancelled, pending_reconnection
            $table->text('error_message')->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->string('user_agent', 255)->nullable();
            $table->timestamps();

            $table->foreign('company_id')->references('id')->on('companies')->nullOnDelete();
            $table->foreign('branch_id')->references('id')->on('branches')->nullOnDelete();
            $table->foreign('user_id')->references('id')->on('users')->nullOnDelete();
            $table->foreign('printer_profile_id')->references('id')->on('printer_profiles')->nullOnDelete();
            $table->foreign('template_id')->references('id')->on('label_templates')->nullOnDelete();
        });

        // 5. Print Job Items
        Schema::create('print_job_items', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('print_job_id')->index();
            $table->unsignedBigInteger('product_id')->nullable()->index();
            $table->string('product_name');
            $table->string('sku', 100);
            $table->string('barcode', 100)->nullable();
            $table->decimal('sale_price', 12, 2)->default(0.00);
            $table->integer('quantity')->default(1);
            $table->json('extra_data')->nullable(); // lotNumber, binLocation, expiryDate, mrp
            $table->timestamps();

            $table->foreign('print_job_id')->references('id')->on('print_jobs')->cascadeOnDelete();
            $table->foreign('product_id')->references('id')->on('products')->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('print_job_items');
        Schema::dropIfExists('print_jobs');
        Schema::dropIfExists('label_templates');
        Schema::dropIfExists('thermal_paper_profiles');
        Schema::dropIfExists('printer_profiles');
    }
};
