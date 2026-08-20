<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\Setting;

class SettingsSeeder extends Seeder
{
    public function run()
    {
        $defaults = [
            // General
            ['key' => 'app_name', 'value' => 'Business OS', 'group' => 'general', 'description' => 'Business name shown across the app.', 'is_public' => true],
            ['key' => 'app_tagline', 'value' => 'Manage your business effortlessly', 'group' => 'general', 'description' => 'Short tagline.', 'is_public' => true],
            ['key' => 'contact_email', 'value' => 'support@example.com', 'group' => 'general', 'description' => 'Support email address.', 'is_public' => true],
            ['key' => 'phone', 'value' => '+91 00000 00000', 'group' => 'general', 'description' => 'Business contact number.', 'is_public' => true],
            ['key' => 'address', 'value' => 'Your Address, City, State, PIN', 'group' => 'general', 'description' => 'Business address.', 'is_public' => true],

            // Finance
            ['key' => 'currency', 'value' => 'INR', 'group' => 'finance', 'description' => 'Default currency for reports.', 'is_public' => true],
            ['key' => 'tax_rate', 'value' => '18', 'group' => 'finance', 'description' => 'Default GST tax rate (%).', 'is_public' => true],
            ['key' => 'invoice_prefix', 'value' => 'INV-', 'group' => 'finance', 'description' => 'Invoice number prefix.', 'is_public' => true],

            // System
            ['key' => 'timezone', 'value' => 'Asia/Kolkata', 'group' => 'system', 'description' => 'Default timezone.', 'is_public' => false],
            ['key' => 'maintenance_mode', 'value' => 'false', 'group' => 'system', 'description' => 'Enable maintenance mode.', 'is_public' => false],
            ['key' => 'debug_mode', 'value' => 'false', 'group' => 'system', 'description' => 'Enable debug logging.', 'is_public' => false],

            // Notifications
            ['key' => 'email_notifications', 'value' => 'true', 'group' => 'notifications', 'description' => 'Send email notifications.', 'is_public' => true],
            ['key' => 'sms_notifications', 'value' => 'false', 'group' => 'notifications', 'description' => 'Send SMS notifications.', 'is_public' => true],
        ];

        foreach ($defaults as $setting) {
            Setting::updateOrCreate(['key' => $setting['key']], $setting);
        }
    }
}