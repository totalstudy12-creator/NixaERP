<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SocialAccount;
use App\Models\SocialPost;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class MarketingController extends Controller
{
    public function dashboard()
    {
        $accounts = SocialAccount::orderBy('platform')->get();
        $posts = SocialPost::orderByDesc('created_at')->get();

        $connectedAccounts = $accounts->filter(fn ($account) => $account->status === 'connected');
        $scheduledPosts = $posts->filter(fn ($post) => $post->status === 'scheduled');

        return response()->json([
            'success' => true,
            'data' => [
                'connected_accounts' => $connectedAccounts->count(),
                'scheduled_posts' => $scheduledPosts->count(),
                'total_followers' => 0,
                'total_engagement' => 0,
                'accounts' => $accounts,
                'posts' => $posts,
            ],
        ]);
    }

    public function accounts()
    {
        return response()->json([
            'success' => true,
            'data' => SocialAccount::orderBy('platform')->get(),
        ]);
    }

    public function posts()
    {
        return response()->json([
            'success' => true,
            'data' => SocialPost::orderByDesc('created_at')->get(),
        ]);
    }

    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'content' => 'required|string|max:5000',
            'platforms' => 'array',
            'platforms.*' => 'string',
            'status' => 'nullable|string|in:draft,scheduled,publishing,published,failed,cancelled',
            'scheduled_at' => 'nullable|date',
            'media_path' => 'nullable|string',
            'media_type' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $status = $request->input('status', $request->filled('scheduled_at') ? 'scheduled' : 'draft');

        $post = SocialPost::create([
            'content' => $request->input('content'),
            'status' => $status,
            'scheduled_at' => $request->input('scheduled_at'),
            'created_by' => $request->user()?->id,
            'media_path' => $request->input('media_path'),
            'media_type' => $request->input('media_type'),
            'metadata' => [
                'platforms' => $request->input('platforms', []),
            ],
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Post created',
            'data' => $post,
        ], 201);
    }

    public function update(Request $request, SocialPost $post)
    {
        $validator = Validator::make($request->all(), [
            'content' => 'sometimes|string|max:5000',
            'status' => 'sometimes|string|in:draft,scheduled,publishing,published,failed,cancelled',
            'scheduled_at' => 'nullable|date',
            'media_path' => 'nullable|string',
            'media_type' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $post->fill($request->only(['content', 'status', 'scheduled_at', 'media_path', 'media_type']));
        $post->save();

        return response()->json([
            'success' => true,
            'message' => 'Post updated',
            'data' => $post,
        ]);
    }

    public function destroy(SocialPost $post)
    {
        $post->delete();

        return response()->json([
            'success' => true,
            'message' => 'Post deleted',
        ]);
    }

    public function calendar()
    {
        return response()->json([
            'success' => true,
            'data' => SocialPost::whereNotNull('scheduled_at')->orderBy('scheduled_at')->get(),
        ]);
    }

    public function analytics()
    {
        $accounts = SocialAccount::where('status', 'connected')->get();

        return response()->json([
            'success' => true,
            'data' => [
                'followers' => 0,
                'engagement' => 0,
                'accounts' => $accounts->count(),
                'message' => $accounts->count() ? 'Platform analytics are available when configured.' : 'Analytics unavailable for this account',
            ],
        ]);
    }

    public function inbox()
    {
        return response()->json([
            'success' => true,
            'data' => [],
            'message' => 'Integration unavailable',
        ]);
    }
}
