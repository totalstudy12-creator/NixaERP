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
        // 1. Delivery Areas (Kashichak, Warisaliganj, Nalanda, Nawada, etc.)
        if (!Schema::hasTable('delivery_areas')) {
            Schema::create('delivery_areas', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('company_id')->nullable()->index();
                $table->unsignedBigInteger('branch_id')->nullable()->index();
                $table->string('name', 100)->index();
                $table->string('district', 100)->default('Nawada')->index();
                $table->string('state', 100)->default('Bihar');
                $table->string('postal_code', 20)->nullable();
                $table->decimal('latitude', 10, 7)->nullable();
                $table->decimal('longitude', 10, 7)->nullable();
                $table->text('description')->nullable();
                $table->boolean('is_active')->default(true);
                $table->timestamps();

                $table->foreign('company_id')->references('id')->on('companies')->onDelete('cascade');
                $table->foreign('branch_id')->references('id')->on('branches')->onDelete('cascade');
            });
        }

        // 2. Delivery Drivers
        if (!Schema::hasTable('delivery_drivers')) {
            Schema::create('delivery_drivers', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('company_id')->index();
                $table->unsignedBigInteger('branch_id')->nullable()->index();
                $table->unsignedBigInteger('employee_id')->nullable()->index();
                $table->string('name', 150)->index();
                $table->string('contact_number', 30)->index();
                $table->string('alternate_contact', 30)->nullable();
                $table->string('license_number', 50)->nullable()->index();
                $table->date('license_validity')->nullable();
                $table->text('address')->nullable();
                $table->string('status', 30)->default('available')->index(); // available, assigned, on_trip, on_leave, inactive
                $table->text('notes')->nullable();
                $table->boolean('is_active')->default(true);
                $table->timestamps();
                $table->softDeletes();

                $table->foreign('company_id')->references('id')->on('companies')->onDelete('cascade');
                $table->foreign('branch_id')->references('id')->on('branches')->onDelete('set null');
                $table->foreign('employee_id')->references('id')->on('employees')->onDelete('set null');
            });
        }

        // 3. Delivery Vehicles (TOTO, Four Wheeler, Carrier, etc.)
        if (!Schema::hasTable('delivery_vehicles')) {
            Schema::create('delivery_vehicles', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('company_id')->index();
                $table->unsignedBigInteger('branch_id')->nullable()->index();
                $table->string('vehicle_code', 50)->unique();
                $table->string('registration_number', 50)->index();
                $table->string('name', 150);
                $table->string('type', 40)->default('toto')->index(); // toto, four_wheeler, carrier, other
                $table->string('category', 100)->nullable();
                $table->decimal('max_capacity', 12, 2)->default(500);
                $table->string('capacity_unit', 30)->default('kg'); // kg, pieces, cubic_feet, cubic_meters
                $table->unsignedBigInteger('default_driver_id')->nullable()->index();
                $table->unsignedBigInteger('backup_driver_id')->nullable();
                $table->string('ownership_type', 30)->default('owned'); // owned, leased, rented
                $table->string('status', 30)->default('available')->index(); // available, assigned, on_trip, under_maintenance, inactive
                $table->string('maintenance_status', 30)->default('good'); // good, due_soon, under_service
                $table->text('notes')->nullable();
                $table->boolean('is_active')->default(true);
                $table->timestamps();
                $table->softDeletes();

                $table->foreign('company_id')->references('id')->on('companies')->onDelete('cascade');
                $table->foreign('branch_id')->references('id')->on('branches')->onDelete('set null');
                $table->foreign('default_driver_id')->references('id')->on('delivery_drivers')->onDelete('set null');
                $table->foreign('backup_driver_id')->references('id')->on('delivery_drivers')->onDelete('set null');
            });
        }

        // 4. Delivery Trips (Multi-customer carrier trips)
        if (!Schema::hasTable('delivery_trips')) {
            Schema::create('delivery_trips', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('company_id')->index();
                $table->unsignedBigInteger('branch_id')->index();
                $table->string('trip_code', 60)->unique();
                $table->unsignedBigInteger('vehicle_id')->nullable()->index();
                $table->unsignedBigInteger('driver_id')->nullable()->index();
                $table->unsignedBigInteger('source_warehouse_id')->nullable()->index();
                $table->date('planned_date')->index();
                $table->dateTime('planned_departure')->nullable();
                $table->dateTime('expected_return')->nullable();
                $table->dateTime('actual_departure')->nullable();
                $table->dateTime('actual_return')->nullable();
                $table->string('status', 40)->default('draft')->index(); // draft, planned, vehicle_assigned, loading_pending, loading_in_progress, ready_for_dispatch, dispatched, in_transit, partially_completed, completed, cancelled, closed
                $table->integer('total_customers')->default(0);
                $table->integer('total_items_count')->default(0);
                $table->decimal('total_quantity', 12, 2)->default(0);
                $table->decimal('total_weight_kg', 12, 2)->default(0);
                $table->decimal('total_volume_cft', 12, 2)->default(0);
                $table->boolean('capacity_override')->default(false);
                $table->text('capacity_override_reason')->nullable();
                $table->unsignedBigInteger('capacity_override_by')->nullable();
                $table->decimal('transport_cost', 12, 2)->default(0);
                $table->string('cost_allocation_status', 30)->default('draft')->index(); // draft, allocated, approved
                $table->string('cost_allocation_method', 30)->nullable(); // equal, quantity, weight, volume, percentage, manual
                $table->unsignedBigInteger('dispatched_by')->nullable();
                $table->unsignedBigInteger('closed_by')->nullable();
                $table->decimal('odometer_start', 10, 2)->nullable();
                $table->decimal('odometer_end', 10, 2)->nullable();
                $table->text('notes')->nullable();
                $table->unsignedBigInteger('created_by')->nullable()->index();
                $table->timestamps();
                $table->softDeletes();

                $table->foreign('company_id')->references('id')->on('companies')->onDelete('cascade');
                $table->foreign('branch_id')->references('id')->on('branches')->onDelete('cascade');
                $table->foreign('vehicle_id')->references('id')->on('delivery_vehicles')->onDelete('set null');
                $table->foreign('driver_id')->references('id')->on('delivery_drivers')->onDelete('set null');
                $table->foreign('source_warehouse_id')->references('id')->on('warehouses')->onDelete('set null');
                $table->foreign('capacity_override_by')->references('id')->on('users')->onDelete('set null');
                $table->foreign('dispatched_by')->references('id')->on('users')->onDelete('set null');
                $table->foreign('closed_by')->references('id')->on('users')->onDelete('set null');
                $table->foreign('created_by')->references('id')->on('users')->onDelete('set null');
            });
        }

        // 5. Delivery Orders (Invoice-linked delivery orders)
        if (!Schema::hasTable('delivery_orders')) {
            Schema::create('delivery_orders', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('company_id')->index();
                $table->unsignedBigInteger('branch_id')->index();
                $table->unsignedBigInteger('invoice_id')->index();
                $table->unsignedBigInteger('customer_id')->index();
                $table->string('delivery_order_no', 60)->unique();
                $table->unsignedBigInteger('delivery_area_id')->nullable()->index();
                $table->string('delivery_type', 40)->default('nearby_town')->index(); // local, nearby_town, district, special, customer_pickup, other
                $table->string('priority', 20)->default('normal')->index(); // normal, high, urgent
                $table->date('expected_delivery_date')->index();
                $table->string('expected_delivery_time', 50)->nullable();
                $table->string('recipient_name', 150);
                $table->string('recipient_phone', 30)->index();
                $table->text('delivery_address');
                $table->string('district', 100)->default('Nawada')->index();
                $table->string('town', 100)->default('Kashichak')->index();
                $table->string('landmark', 150)->nullable();
                $table->decimal('latitude', 10, 7)->nullable();
                $table->decimal('longitude', 10, 7)->nullable();
                $table->text('delivery_instructions')->nullable();
                $table->decimal('delivery_charge', 10, 2)->default(0);
                $table->integer('total_items_count')->default(0);
                $table->decimal('total_quantity', 12, 2)->default(0);
                $table->string('status', 40)->default('delivery_pending')->index(); // delivery_pending, scheduled, vehicle_assigned, loading_pending, loading_in_progress, ready_for_dispatch, dispatched, partially_delivered, delivered, delivery_failed, rescheduled, cancelled
                $table->unsignedBigInteger('current_trip_id')->nullable()->index();
                $table->dateTime('delivery_completed_at')->nullable();
                $table->unsignedBigInteger('created_by')->nullable()->index();
                $table->timestamps();
                $table->softDeletes();

                $table->foreign('company_id')->references('id')->on('companies')->onDelete('cascade');
                $table->foreign('branch_id')->references('id')->on('branches')->onDelete('cascade');
                $table->foreign('invoice_id')->references('id')->on('invoices')->onDelete('cascade');
                $table->foreign('customer_id')->references('id')->on('customers')->onDelete('cascade');
                $table->foreign('delivery_area_id')->references('id')->on('delivery_areas')->onDelete('set null');
                $table->foreign('current_trip_id')->references('id')->on('delivery_trips')->onDelete('set null');
                $table->foreign('created_by')->references('id')->on('users')->onDelete('set null');
            });
        }

        // 6. Delivery Order Items
        if (!Schema::hasTable('delivery_order_items')) {
            Schema::create('delivery_order_items', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('delivery_order_id')->index();
                $table->unsignedBigInteger('invoice_item_id')->index();
                $table->unsignedBigInteger('product_id')->index();
                $table->string('product_name', 200);
                $table->string('unit', 30)->default('pcs');
                $table->decimal('requested_quantity', 12, 2);
                $table->decimal('loaded_quantity', 12, 2)->default(0);
                $table->decimal('delivered_quantity', 12, 2)->default(0);
                $table->decimal('pending_quantity', 12, 2)->default(0);
                $table->unsignedBigInteger('source_warehouse_id')->nullable()->index();
                $table->decimal('unit_weight_kg', 10, 3)->nullable();
                $table->decimal('unit_volume_cft', 10, 3)->nullable();
                $table->timestamps();

                $table->foreign('delivery_order_id')->references('id')->on('delivery_orders')->onDelete('cascade');
                $table->foreign('invoice_item_id')->references('id')->on('invoice_items')->onDelete('cascade');
                $table->foreign('product_id')->references('id')->on('products')->onDelete('cascade');
                $table->foreign('source_warehouse_id')->references('id')->on('warehouses')->onDelete('set null');
            });
        }

        // 7. Delivery Trip Stops (Multi-customer route stop sequences)
        if (!Schema::hasTable('delivery_trip_stops')) {
            Schema::create('delivery_trip_stops', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('delivery_trip_id')->index();
                $table->unsignedBigInteger('delivery_order_id')->index();
                $table->unsignedBigInteger('invoice_id')->index();
                $table->integer('stop_sequence')->default(1);
                $table->string('customer_name', 150);
                $table->string('delivery_area', 100)->nullable();
                $table->text('delivery_address');
                $table->decimal('latitude', 10, 7)->nullable();
                $table->decimal('longitude', 10, 7)->nullable();
                $table->string('status', 40)->default('scheduled')->index(); // scheduled, in_transit, arrived, delivered, partially_delivered, failed, rescheduled
                $table->dateTime('estimated_arrival')->nullable();
                $table->dateTime('actual_arrival')->nullable();
                $table->text('notes')->nullable();
                $table->timestamps();

                $table->foreign('delivery_trip_id')->references('id')->on('delivery_trips')->onDelete('cascade');
                $table->foreign('delivery_order_id')->references('id')->on('delivery_orders')->onDelete('cascade');
                $table->foreign('invoice_id')->references('id')->on('invoices')->onDelete('cascade');
            });
        }

        // 8. Godown-wise Loading Items (Checklist & picking tracking per warehouse)
        if (!Schema::hasTable('delivery_loading_items')) {
            Schema::create('delivery_loading_items', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('delivery_trip_id')->index();
                $table->unsignedBigInteger('delivery_order_id')->index();
                $table->unsignedBigInteger('delivery_order_item_id')->index();
                $table->unsignedBigInteger('product_id')->index();
                $table->unsignedBigInteger('warehouse_id')->index();
                $table->decimal('planned_quantity', 12, 2);
                $table->decimal('picked_quantity', 12, 2)->default(0);
                $table->boolean('is_loaded')->default(false);
                $table->dateTime('loaded_at')->nullable();
                $table->unsignedBigInteger('loaded_by')->nullable();
                $table->string('notes', 255)->nullable();
                $table->timestamps();

                $table->foreign('delivery_trip_id')->references('id')->on('delivery_trips')->onDelete('cascade');
                $table->foreign('delivery_order_id')->references('id')->on('delivery_orders')->onDelete('cascade');
                $table->foreign('delivery_order_item_id')->references('id')->on('delivery_order_items')->onDelete('cascade');
                $table->foreign('product_id')->references('id')->on('products')->onDelete('cascade');
                $table->foreign('warehouse_id')->references('id')->on('warehouses')->onDelete('cascade');
                $table->foreign('loaded_by')->references('id')->on('users')->onDelete('set null');
            });
        }

        // 9. Delivery Attempts (Full, partial, multiple attempts, failures)
        if (!Schema::hasTable('delivery_attempts')) {
            Schema::create('delivery_attempts', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('delivery_order_id')->index();
                $table->unsignedBigInteger('delivery_trip_id')->nullable()->index();
                $table->unsignedBigInteger('delivery_trip_stop_id')->nullable()->index();
                $table->integer('attempt_number')->default(1);
                $table->dateTime('attempt_date');
                $table->string('status', 40)->index(); // delivered, partially_delivered, failed
                $table->string('failure_reason', 60)->nullable()->index(); // customer_unavailable, address_not_found, customer_refused, vehicle_breakdown, damaged_goods, payment_issue, rescheduled_by_customer, other
                $table->text('failure_remarks')->nullable();
                $table->string('receiver_name', 150)->nullable();
                $table->string('receiver_phone', 30)->nullable();
                $table->string('receiver_relationship', 60)->nullable();
                $table->string('signature_url', 255)->nullable();
                $table->string('photo_proof_url', 255)->nullable();
                $table->decimal('latitude', 10, 7)->nullable();
                $table->decimal('longitude', 10, 7)->nullable();
                $table->unsignedBigInteger('performed_by')->nullable()->index();
                $table->timestamps();

                $table->foreign('delivery_order_id')->references('id')->on('delivery_orders')->onDelete('cascade');
                $table->foreign('delivery_trip_id')->references('id')->on('delivery_trips')->onDelete('set null');
                $table->foreign('delivery_trip_stop_id')->references('id')->on('delivery_trip_stops')->onDelete('set null');
                $table->foreign('performed_by')->references('id')->on('users')->onDelete('set null');
            });
        }

        // 10. Delivery Attempt Items (Line-item verification for partial delivery)
        if (!Schema::hasTable('delivery_attempt_items')) {
            Schema::create('delivery_attempt_items', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('delivery_attempt_id')->index();
                $table->unsignedBigInteger('delivery_order_item_id')->index();
                $table->unsignedBigInteger('product_id')->index();
                $table->decimal('loaded_quantity', 12, 2);
                $table->decimal('delivered_quantity', 12, 2);
                $table->decimal('returned_quantity', 12, 2)->default(0);
                $table->unsignedBigInteger('return_to_warehouse_id')->nullable()->index();
                $table->string('remarks', 255)->nullable();
                $table->timestamps();

                $table->foreign('delivery_attempt_id')->references('id')->on('delivery_attempts')->onDelete('cascade');
                $table->foreign('delivery_order_item_id')->references('id')->on('delivery_order_items')->onDelete('cascade');
                $table->foreign('product_id')->references('id')->on('products')->onDelete('cascade');
                $table->foreign('return_to_warehouse_id')->references('id')->on('warehouses')->onDelete('set null');
            });
        }

        // 11. Delivery Cost Allocations (Multi-customer vehicle trip transportation cost split)
        if (!Schema::hasTable('delivery_cost_allocations')) {
            Schema::create('delivery_cost_allocations', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('delivery_trip_id')->index();
                $table->unsignedBigInteger('delivery_order_id')->index();
                $table->unsignedBigInteger('invoice_id')->index();
                $table->string('allocation_method', 30)->default('equal'); // equal, quantity, weight, volume, percentage, manual
                $table->decimal('allocation_basis_value', 12, 4)->default(0);
                $table->decimal('allocation_percentage', 8, 4)->default(0);
                $table->decimal('calculated_amount', 12, 2)->default(0);
                $table->decimal('adjustment_amount', 12, 2)->default(0);
                $table->decimal('final_allocated_amount', 12, 2)->default(0);
                $table->text('adjustment_reason')->nullable();
                $table->unsignedBigInteger('adjusted_by')->nullable();
                $table->boolean('is_approved')->default(false);
                $table->unsignedBigInteger('approved_by')->nullable();
                $table->dateTime('approved_at')->nullable();
                $table->timestamps();

                $table->foreign('delivery_trip_id')->references('id')->on('delivery_trips')->onDelete('cascade');
                $table->foreign('delivery_order_id')->references('id')->on('delivery_orders')->onDelete('cascade');
                $table->foreign('invoice_id')->references('id')->on('invoices')->onDelete('cascade');
                $table->foreign('adjusted_by')->references('id')->on('users')->onDelete('set null');
                $table->foreign('approved_by')->references('id')->on('users')->onDelete('set null');
            });
        }

        // 12. Delivery Status Histories (Immutable lifecycle trail)
        if (!Schema::hasTable('delivery_status_histories')) {
            Schema::create('delivery_status_histories', function (Blueprint $table) {
                $table->id();
                $table->string('model_type', 40)->index(); // order, trip, vehicle, driver
                $table->unsignedBigInteger('model_id')->index();
                $table->string('previous_status', 40)->nullable();
                $table->string('new_status', 40)->index();
                $table->unsignedBigInteger('user_id')->nullable()->index();
                $table->text('remarks')->nullable();
                $table->json('metadata')->nullable();
                $table->timestamp('created_at')->useCurrent()->index();

                $table->foreign('user_id')->references('id')->on('users')->onDelete('set null');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('delivery_status_histories');
        Schema::dropIfExists('delivery_cost_allocations');
        Schema::dropIfExists('delivery_attempt_items');
        Schema::dropIfExists('delivery_attempts');
        Schema::dropIfExists('delivery_loading_items');
        Schema::dropIfExists('delivery_trip_stops');
        Schema::dropIfExists('delivery_order_items');
        Schema::dropIfExists('delivery_orders');
        Schema::dropIfExists('delivery_trips');
        Schema::dropIfExists('delivery_vehicles');
        Schema::dropIfExists('delivery_drivers');
        Schema::dropIfExists('delivery_areas');
    }
};
