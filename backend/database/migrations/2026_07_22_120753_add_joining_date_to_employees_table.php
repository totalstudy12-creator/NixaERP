<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            if (!Schema::hasColumn('employees', 'joining_date')) {
                $table->date('joining_date')->nullable()->after('date_of_birth');
            }
            if (!Schema::hasColumn('employees', 'first_name')) {
                $table->string('first_name')->nullable()->after('id');
            }
            if (!Schema::hasColumn('employees', 'last_name')) {
                $table->string('last_name')->nullable()->after('first_name');
            }
            if (!Schema::hasColumn('employees', 'phone')) {
                $table->string('phone')->nullable()->after('last_name');
            }
            if (!Schema::hasColumn('employees', 'gender')) {
                $table->string('gender')->nullable()->after('phone');
            }
            if (!Schema::hasColumn('employees', 'date_of_birth')) {
                $table->date('date_of_birth')->nullable()->after('gender');
            }
            if (!Schema::hasColumn('employees', 'salary')) {
                $table->decimal('salary', 10, 2)->nullable()->after('joining_date');
            }
            if (!Schema::hasColumn('employees', 'finger_id')) {
                $table->unsignedBigInteger('finger_id')->unique()->nullable()->after('id');
            }
        });
    }

    public function down(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->dropColumn([
                'joining_date', 'finger_id', 'first_name', 'last_name',
                'phone', 'gender', 'date_of_birth', 'salary'
            ]);
        });
    }
};