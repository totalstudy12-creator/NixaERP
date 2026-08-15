<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class AiConversation extends Model
{
    use HasFactory;

    protected $table = 'ai_conversations';

    protected $fillable = ['user_id','title','metadata'];

    public function messages()
    {
        return $this->hasMany(AiMessage::class, 'conversation_id');
    }
}
