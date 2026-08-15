<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class FingerprintTemplate extends Model
{
    use HasFactory;

    protected $fillable = [
        'employee_id', 'finger_index', 'template_data',
        'template_format', 'size_bytes',
    ];

    protected $hidden = ['template_data']; // never expose raw template

    public function employee()
    {
        return $this->belongsTo(Employee::class);
    }
}