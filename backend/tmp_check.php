<?php
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Models\Company;
use App\Models\Employee;
use App\Models\Attendance;
use Illuminate\Http\Request;
use App\Http\Controllers\Api\AttendanceController;

$company = Company::create(['name'=>'Tmp Co','email'=>'tmpco@example.com','phone'=>'123','address'=>'x']);
$employee = Employee::create([
    'company_id' => $company->id,
    'branch_id' => null,
    'employee_code' => 'TMP-3',
    'first_name' => 'Test',
    'last_name' => 'User',
    'email' => 'tmp3@example.com',
    'status' => 'active',
]);
$attendance = Attendance::create(['employee_id'=>$employee->id,'date'=>'2026-07-16','status'=>'present']);
$request = new Request();
$request->setMethod('PUT');
$request->request->add(['status'=>'remote','notes'=>'Remote day']);
$controller = new AttendanceController();
$response = $controller->update($request, $attendance);
$contents = json_decode($response->getContent(), true);
var_dump($contents);
$fresh = $attendance->fresh();
var_dump($fresh->toArray());
