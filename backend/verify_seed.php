<?php
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\Company;
use App\Models\Employee;
use App\Models\Attendance;

echo 'Companies: ' . Company::count() . PHP_EOL;
echo 'Employees: ' . Employee::count() . PHP_EOL;
echo 'Attendance: ' . Attendance::count() . PHP_EOL;
