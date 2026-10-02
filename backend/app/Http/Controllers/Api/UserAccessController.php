<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;

class UserAccessController extends Controller
{
    private const SYSTEM_ADMIN_ROLES = ['Admin', 'Super Admin'];

    /* ============================ ROLES ============================ */

    public function roles(): JsonResponse
    {
        $roles = Role::with('permissions')->orderBy('name')->get();

        return response()->json([
            'success' => true,
            'data'    => $roles->map(fn (Role $role) => $this->serializeRole($role)),
        ]);
    }

    public function showRole(int $roleId): JsonResponse
    {
        $role = Role::with('permissions')->findOrFail($roleId);

        return response()->json([
            'success' => true,
            'data'    => $this->serializeRole($role),
        ]);
    }

    public function storeRole(Request $request): JsonResponse
    {
        $isSystemAdminRole = $this->isSystemAdminRoleName((string) $request->input('name'));
        if ($isSystemAdminRole && ! $this->isSystemAdministrator($request->user())) {
            return $this->forbiddenSystemRoleChange();
        }
        if ($isSystemAdminRole && ! $request->boolean('active', true)) {
            return $this->systemRoleConflict('System administrator roles must remain active.');
        }

        $validator = Validator::make($request->all(), [
            'name'             => 'required|string|max:255|unique:roles,name',
            'group'            => 'nullable|string|max:255',
            'description'      => 'nullable|string|max:1000',
            'active'           => 'nullable|boolean',
            'permission_ids'   => 'nullable|array',
            'permission_ids.*' => 'integer|exists:permissions,id',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors());
        }

        $role = DB::transaction(function () use ($request) {
            $role = Role::create([
                'name'        => $request->input('name'),
                'group'       => $request->input('group'),
                'description' => $request->input('description'),
                'active'      => $request->boolean('active', true),
            ]);

            $role->permissions()->sync($request->input('permission_ids', []));
            return $role;
        });

        return response()->json([
            'success' => true,
            'message' => 'Role created successfully',
            'data'    => $this->serializeRole($role->load('permissions')),
        ], 201);
    }

    public function updateRole(Request $request, int $roleId): JsonResponse
    {
        $role = Role::findOrFail($roleId);
        $isProtectedRole = $this->isSystemAdminRoleName($role->name);
        $becomesProtectedRole = $this->isSystemAdminRoleName((string) $request->input('name'));

        if (($isProtectedRole || $becomesProtectedRole)
            && ! $this->isSystemAdministrator($request->user())) {
            return $this->forbiddenSystemRoleChange();
        }
        if ($isProtectedRole && (string) $request->input('name') !== $role->name) {
            return $this->systemRoleConflict('System administrator role names cannot be changed.');
        }
        if (($isProtectedRole || $becomesProtectedRole)
            && $request->has('active') && ! $request->boolean('active')) {
            return $this->systemRoleConflict('System administrator roles must remain active.');
        }

        $validator = Validator::make($request->all(), [
            'name'             => 'required|string|max:255|unique:roles,name,' . $role->id,
            'group'            => 'nullable|string|max:255',
            'description'      => 'nullable|string|max:1000',
            'active'           => 'nullable|boolean',
            'permission_ids'   => 'nullable|array',
            'permission_ids.*' => 'integer|exists:permissions,id',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors());
        }

        DB::transaction(function () use ($request, $role) {
            $role->fill([
                'name'        => $request->input('name'),
                'group'       => $request->input('group'),
                'description' => $request->input('description'),
                'active'      => $request->boolean('active', $role->active),
            ])->save();

            if ($request->has('permission_ids')) {
                $role->permissions()->sync($request->input('permission_ids', []));
            }
        });

        return response()->json([
            'success' => true,
            'message' => 'Role updated successfully',
            'data'    => $this->serializeRole($role->fresh()->load('permissions')),
        ]);
    }

    public function destroyRole(Request $request, int $roleId): JsonResponse
    {
        $role = Role::findOrFail($roleId);
        if ($this->isSystemAdminRoleName($role->name)) {
            if (! $this->isSystemAdministrator($request->user())) {
                return $this->forbiddenSystemRoleChange();
            }
            return $this->systemRoleConflict('System administrator roles cannot be deleted.');
        }

        DB::transaction(function () use ($role) {
            $role->permissions()->detach();
            $role->users()->detach();
            $role->delete();
        });

        return response()->json([
            'success' => true,
            'message' => 'Role deleted successfully',
        ]);
    }

    /* ========================== PERMISSIONS ========================= */

    public function permissions(): JsonResponse
    {
        $permissions = Permission::orderBy('group')->orderBy('name')->get();

        return response()->json([
            'success' => true,
            'data'    => $permissions->map(fn (Permission $p) => $this->serializePermission($p)),
        ]);
    }

    public function storePermission(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'name'        => 'required|string|max:255|unique:permissions,name',
            'group'       => 'nullable|string|max:255',
            'description' => 'nullable|string|max:1000',
            'active'      => 'nullable|boolean',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors());
        }

        $perm = Permission::create([
            'name'        => $request->input('name'),
            'group'       => $request->input('group'),
            'description' => $request->input('description'),
            'active'      => $request->boolean('active', true),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Permission created successfully',
            'data'    => $this->serializePermission($perm),
        ], 201);
    }

    public function updatePermission(Request $request, int $permissionId): JsonResponse
    {
        $perm = Permission::findOrFail($permissionId);

        $validator = Validator::make($request->all(), [
            'name'        => 'required|string|max:255|unique:permissions,name,' . $perm->id,
            'group'       => 'nullable|string|max:255',
            'description' => 'nullable|string|max:1000',
            'active'      => 'nullable|boolean',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors());
        }

        $perm->fill([
            'name'        => $request->input('name'),
            'group'       => $request->input('group'),
            'description' => $request->input('description'),
            'active'      => $request->boolean('active', $perm->active),
        ])->save();

        return response()->json([
            'success' => true,
            'message' => 'Permission updated successfully',
            'data'    => $this->serializePermission($perm),
        ]);
    }

    public function destroyPermission(int $permissionId): JsonResponse
    {
        $perm = Permission::findOrFail($permissionId);
        $perm->roles()->detach();
        $perm->delete();

        return response()->json([
            'success' => true,
            'message' => 'Permission deleted successfully',
        ]);
    }

    /* ============================= USERS =========================== */

    /**
     * IMPORTANT: no `roles.permissions` nested eager load here.
     * Permissions are resolved per-user via User::resolvePermissions()
     * inside serializeUser(). This avoids the `addEagerConstraints`
     * clash with the User model's Collection-returning resolver.
     */
    public function users(): JsonResponse
    {
        $users = User::with('roles')->orderBy('name')->get();

        return response()->json([
            'success' => true,
            'data'    => $users->map(fn (User $u) => $this->serializeUser($u)),
        ]);
    }

    public function showUser(int $userId): JsonResponse
    {
        $user = User::with('roles')->findOrFail($userId);

        return response()->json([
            'success' => true,
            'data'    => $this->serializeUser($user),
        ]);
    }

    public function storeUser(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'name'             => 'required|string|max:255',
            'email'            => 'required|email|unique:users,email',
            'password'         => 'required|string|min:6',
            'phone'            => 'nullable|string|max:50',
            'role_ids'         => 'nullable|array',
            'role_ids.*'       => 'integer|exists:roles,id',
            'permission_ids'   => 'nullable|array',
            'permission_ids.*' => 'integer|exists:permissions,id',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors());
        }

        if ($this->systemRoleAssignmentDenied($request, $request->input('role_ids', []))) {
            return $this->forbiddenSystemRoleChange();
        }

        $user = DB::transaction(function () use ($request) {
            $user = User::create([
                'name'     => $request->input('name'),
                'email'    => $request->input('email'),
                'password' => Hash::make($request->input('password')),
                'phone'    => $request->input('phone'),
            ]);

            if ($request->has('role_ids')) {
                $user->roles()->sync($request->input('role_ids', []));
            }

            return $user;
        });

        return response()->json([
            'success' => true,
            'message' => 'User created successfully',
            'data'    => $this->serializeUser($user->load('roles')),
        ], 201);
    }

    public function updateUser(Request $request, int $userId): JsonResponse
    {
        $user = User::findOrFail($userId);
        if ($this->hasSystemAdminRole($user) && ! $this->isSystemAdministrator($request->user())) {
            return $this->forbiddenSystemRoleChange();
        }

        $validator = Validator::make($request->all(), [
            'name'       => 'sometimes|string|max:255',
            'email'      => 'sometimes|email|unique:users,email,' . $user->id,
            'password'   => 'sometimes|nullable|string|min:6',
            'phone'      => 'sometimes|nullable|string|max:50',
            'role_ids'   => 'nullable|array',
            'role_ids.*' => 'integer|exists:roles,id',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors());
        }

        if ($request->has('role_ids')) {
            $roleIds = (array) $request->input('role_ids', []);
            if ($this->systemRoleAssignmentDenied($request, $roleIds)) {
                return $this->forbiddenSystemRoleChange();
            }
            if ($this->removesLastSystemAdministrator($user, $roleIds)) {
                return $this->lastAdministratorConflict();
            }
        }

        DB::transaction(function () use ($request, $user) {
            $data = $request->only(['name', 'email', 'phone']);

            if ($request->filled('password')) {
                $data['password'] = Hash::make($request->input('password'));
            }

            $user->fill($data)->save();

            if ($request->has('role_ids')) {
                $user->roles()->sync($request->input('role_ids', []));
            }

            $user->flushPermissionCache();
        });

        return response()->json([
            'success' => true,
            'message' => 'User updated successfully',
            'data'    => $this->serializeUser($user->fresh()->load('roles')),
        ]);
    }

    public function destroyUser(Request $request, int $userId): JsonResponse
    {
        $user = User::findOrFail($userId);

        if ($this->hasSystemAdminRole($user) && ! $this->isSystemAdministrator($request->user())) {
            return $this->forbiddenSystemRoleChange();
        }
        if ($this->removesLastSystemAdministrator($user, [])) {
            return $this->lastAdministratorConflict();
        }

        if ($request->user()->id === $user->id) {
            return response()->json([
                'success' => false,
                'message' => 'You cannot delete your own account.',
            ], 422);
        }

        DB::transaction(function () use ($user) {
            $user->roles()->detach();
            $user->tokens()->delete();
            $user->delete();
        });

        return response()->json([
            'success' => true,
            'message' => 'User deleted successfully',
        ]);
    }

    public function assignRolesToUser(Request $request, int $userId): JsonResponse
    {
        $user = User::findOrFail($userId);
        if ($this->hasSystemAdminRole($user) && ! $this->isSystemAdministrator($request->user())) {
            return $this->forbiddenSystemRoleChange();
        }

        $validator = Validator::make($request->all(), [
            'role_ids'   => 'required|array',
            'role_ids.*' => 'integer|exists:roles,id',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors());
        }

        $roleIds = (array) $request->input('role_ids', []);
        if ($this->systemRoleAssignmentDenied($request, $roleIds)) {
            return $this->forbiddenSystemRoleChange();
        }
        if ($this->removesLastSystemAdministrator($user, $roleIds)) {
            return $this->lastAdministratorConflict();
        }

        $user->roles()->sync($roleIds);
        $user->flushPermissionCache();

        return response()->json([
            'success' => true,
            'message' => 'Roles assigned successfully',
            'data'    => $this->serializeUser($user->fresh()->load('roles')),
        ]);
    }

    /* ==================== DEBUG / SELF INSPECTION ================== */

    public function myPermissions(Request $request): JsonResponse
    {
        $user = $request->user()->load('roles');
        $permissions = $user->resolvePermissions();

        return response()->json([
            'success' => true,
            'data' => [
                'roles'            => $user->roles->pluck('name')->values(),
                'permissions'      => $permissions->map(fn ($p) => [
                    'id' => $p->id, 'name' => $p->name, 'group' => $p->group,
                ])->values(),
                'permission_names' => $permissions->pluck('name')->values(),
                'permission_ids'   => $permissions->pluck('id')->values(),
            ],
        ]);
    }

    /* ============================ HELPERS ========================== */

    private function serializeRole(Role $role): array
    {
        return [
            'id'               => $role->id,
            'name'             => $role->name,
            'group'            => $role->group,
            'description'      => $role->description,
            'active'           => $role->active,
            'permissions'      => $role->permissions->pluck('id')->values(),
            'permission_names' => $role->permissions->pluck('name')->values(),
            'users_count'      => $role->users()->count(),
            'created_at'       => $role->created_at,
            'updated_at'       => $role->updated_at,
        ];
    }

    private function serializePermission(Permission $p): array
    {
        return [
            'id'          => $p->id,
            'name'        => $p->name,
            'group'       => $p->group,
            'description' => $p->description,
            'active'      => $p->active,
            'created_at'  => $p->created_at,
            'updated_at'  => $p->updated_at,
        ];
    }

    private function serializeUser(User $user): array
    {
        // Renamed resolver — no clash with eager-loading.
        $permissions = $user->resolvePermissions();

        return [
            'id'                 => $user->id,
            'name'               => $user->name,
            'email'              => $user->email,
            'phone'              => $user->phone,
            'two_factor_enabled' => $user->hasTwoFactorEnabled(),
            'email_verified_at'  => $user->email_verified_at,
            'roles' => $user->roles->map(fn ($r) => [
                'id'    => $r->id,
                'name'  => $r->name,
                'group' => $r->group,
            ])->values(),
            'role_names'       => $user->roles->pluck('name')->values(),
            'permission_names' => $permissions->pluck('name')->values(),
            'permission_ids'   => $permissions->pluck('id')->values(),
            'created_at'       => $user->created_at,
            'updated_at'       => $user->updated_at,
        ];
    }

    private function validationError($errors): JsonResponse
    {
        return response()->json([
            'success' => false,
            'message' => 'Validation failed',
            'errors'  => $errors,
        ], 422);
    }

    private function isSystemAdminRoleName(string $name): bool
    {
        return in_array($name, self::SYSTEM_ADMIN_ROLES, true);
    }

    private function isSystemAdministrator(?User $user): bool
    {
        return $user !== null && $user->roles()
            ->whereIn('name', self::SYSTEM_ADMIN_ROLES)
            ->exists();
    }

    private function hasSystemAdminRole(User $user): bool
    {
        return $user->roles()->whereIn('name', self::SYSTEM_ADMIN_ROLES)->exists();
    }

    private function systemRoleAssignmentDenied(Request $request, array $roleIds): bool
    {
        if ($this->isSystemAdministrator($request->user()) || empty($roleIds)) {
            return false;
        }

        return Role::query()
            ->whereIn('id', $roleIds)
            ->whereIn('name', self::SYSTEM_ADMIN_ROLES)
            ->exists();
    }

    private function removesLastSystemAdministrator(User $user, array $roleIds): bool
    {
        if (! $this->hasSystemAdminRole($user)) {
            return false;
        }

        $willRemainAdministrator = Role::query()
            ->whereIn('id', $roleIds)
            ->whereIn('name', self::SYSTEM_ADMIN_ROLES)
            ->exists();

        if ($willRemainAdministrator) {
            return false;
        }

        return ! User::query()
            ->whereKeyNot($user->id)
            ->whereHas('roles', fn ($query) => $query->whereIn('roles.name', self::SYSTEM_ADMIN_ROLES))
            ->exists();
    }

    private function forbiddenSystemRoleChange(): JsonResponse
    {
        return response()->json([
            'success' => false,
            'message' => 'You do not have permission to modify system administrator access.',
        ], 403);
    }

    private function lastAdministratorConflict(): JsonResponse
    {
        return response()->json([
            'success' => false,
            'message' => 'At least one system administrator must retain access.',
        ], 409);
    }

    private function systemRoleConflict(string $message): JsonResponse
    {
        return response()->json([
            'success' => false,
            'message' => $message,
        ], 409);
    }
}