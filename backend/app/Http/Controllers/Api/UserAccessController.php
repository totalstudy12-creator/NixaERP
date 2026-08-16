<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class UserAccessController extends Controller
{
    public function roles()
    {
        $roles = Role::with('permissions')->orderBy('name')->get();

        return response()->json([
            'success' => true,
            'data' => $roles->map(function ($role) {
                return [
                    'id' => $role->id,
                    'name' => $role->name,
                    'group' => $role->group,
                    'description' => $role->description,
                    'active' => $role->active,
                    'permissions' => $role->permissions->pluck('id')->values(),
                ];
            }),
        ]);
    }

    public function permissions()
    {
        $permissions = Permission::orderBy('group')->orderBy('name')->get();

        return response()->json([
            'success' => true,
            'data' => $permissions->map(function ($permission) {
                return [
                    'id' => $permission->id,
                    'name' => $permission->name,
                    'group' => $permission->group,
                    'description' => $permission->description,
                    'active' => $permission->active,
                ];
            }),
        ]);
    }

    public function storePermission(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:255|unique:permissions,name',
            'group' => 'nullable|string|max:255',
            'description' => 'nullable|string|max:1000',
            'active' => 'nullable|boolean',
        ]);

        if ($validator->fails()) {
            return response()->json(['success' => false, 'message' => 'Validation failed', 'errors' => $validator->errors()], 422);
        }

        $perm = Permission::create([
            'name' => $request->input('name'),
            'group' => $request->input('group'),
            'description' => $request->input('description'),
            'active' => $request->boolean('active', true),
        ]);

        return response()->json(['success' => true, 'message' => 'Permission created', 'data' => $perm], 201);
    }

    public function users()
    {
        $users = User::with('roles')->orderBy('name')->get();

        return response()->json([
            'success' => true,
            'data' => $users->map(function ($user) {
                return [
                    'id' => $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                    'email_verified_at' => $user->email_verified_at,
                    'roles' => $user->roles->map(function ($role) {
                        return ['id' => $role->id, 'name' => $role->name];
                    }),
                ];
            }),
        ]);
    }

    public function storeUser(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:255',
            'email' => 'required|email|unique:users,email',
            'password' => 'required|string|min:6',
            'role_ids' => 'nullable|array',
            'role_ids.*' => 'integer|exists:roles,id',
        ]);

        if ($validator->fails()) {
            return response()->json(['success' => false, 'message' => 'Validation failed', 'errors' => $validator->errors()], 422);
        }

        $user = User::create([
            'name' => $request->input('name'),
            'email' => $request->input('email'),
            'password' => $request->input('password'),
        ]);

        if ($request->has('role_ids')) {
            $user->roles()->sync($request->input('role_ids', []));
        }

        return response()->json(['success' => true, 'message' => 'User created', 'data' => $user->load('roles')], 201);
    }

    public function storeRole(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:255|unique:roles,name',
            'group' => 'nullable|string|max:255',
            'description' => 'nullable|string|max:1000',
            'active' => 'nullable|boolean',
            'permission_ids' => 'nullable|array',
            'permission_ids.*' => 'integer|exists:permissions,id',
        ]);

        if ($validator->fails()) {
            return response()->json(['success' => false, 'message' => 'Validation failed', 'errors' => $validator->errors()], 422);
        }

        $role = Role::create([
            'name' => $request->input('name'),
            'group' => $request->input('group'),
            'description' => $request->input('description'),
            'active' => $request->boolean('active', true),
        ]);

        if ($request->has('permission_ids')) {
            $role->permissions()->sync($request->input('permission_ids', []));
        }

        return response()->json(['success' => true, 'message' => 'Role created', 'data' => $role->load('permissions')], 201);
    }

    public function updateRole(Request $request, $roleId)
    {
        $role = Role::findOrFail($roleId);

        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:255|unique:roles,name,' . $role->id,
            'group' => 'nullable|string|max:255',
            'description' => 'nullable|string|max:1000',
            'active' => 'nullable|boolean',
            'permission_ids' => 'nullable|array',
            'permission_ids.*' => 'integer|exists:permissions,id',
        ]);

        if ($validator->fails()) {
            return response()->json(['success' => false, 'message' => 'Validation failed', 'errors' => $validator->errors()], 422);
        }

        $role->fill([
            'name' => $request->input('name'),
            'group' => $request->input('group'),
            'description' => $request->input('description'),
            'active' => $request->boolean('active', $role->active),
        ]);
        $role->save();

        if ($request->has('permission_ids')) {
            $role->permissions()->sync($request->input('permission_ids', []));
        }

        return response()->json(['success' => true, 'message' => 'Role updated', 'data' => $role->load('permissions')]);
    }

    public function destroyRole($roleId)
    {
        $role = Role::findOrFail($roleId);
        $role->delete();

        return response()->json(['success' => true, 'message' => 'Role deleted']);
    }

    public function assignRolesToUser(Request $request, $userId)
    {
        $user = User::findOrFail($userId);
        $roleIds = $request->input('role_ids', []);
        $user->roles()->sync($roleIds);

        return response()->json(['success' => true, 'message' => 'Roles assigned successfully']);
    }
}
