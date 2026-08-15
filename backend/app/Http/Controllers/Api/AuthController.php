<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;

class AuthController extends Controller
{
    public function login(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'email' => 'required|email',
            'password' => 'required|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $user = User::where('email', $request->email)->first();

        if (! $user || ! Hash::check($request->password, $user->password)) {
            return response()->json(['message' => 'Invalid credentials'], Response::HTTP_UNAUTHORIZED);
        }

        $token = $user->createToken('auth-token');

        return response()->json([
            'access_token' => $token->plainTextToken,
            'token_type' => 'bearer',
        ]);
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json(['message' => 'Logged out successfully']);
    }

    public function me(Request $request)
    {
        $user = $request->user()->load('roles');

        return response()->json([
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'phone' => $user->phone,
            'location' => $user->location,
            'timezone' => $user->timezone,
            'bio' => $user->bio,
            'avatar_url' => $user->avatar_url,
            'roles' => $user->roles->map(function ($role) {
                return ['id' => $role->id, 'name' => $role->name];
            }),
            'created_at' => $user->created_at,
            'updated_at' => $user->updated_at,
        ]);
    }

    public function profile(Request $request)
    {
        return $this->me($request);
    }

    public function updateProfile(Request $request)
    {
        $user = $request->user();

        $validator = Validator::make($request->all(), [
            'name' => 'sometimes|string|max:255',
            'email' => ['sometimes', 'email', 'max:255', 'unique:users,email,' . $user->id],
            'phone' => 'sometimes|nullable|string|max:50',
            'location' => 'sometimes|nullable|string|max:255',
            'timezone' => 'sometimes|nullable|string|max:64',
            'bio' => 'sometimes|nullable|string|max:1000',
            'avatar_url' => 'sometimes|nullable|url|max:2048',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $user->fill($request->only([
            'name',
            'email',
            'phone',
            'location',
            'timezone',
            'bio',
            'avatar_url',
        ]));
        $user->save();

        return response()->json([
            'success' => true,
            'message' => 'Profile updated successfully',
            'data' => $this->me($request)->getData(true),
        ]);
    }
}
