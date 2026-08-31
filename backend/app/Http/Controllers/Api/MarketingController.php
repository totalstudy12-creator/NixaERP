<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SocialAccount;
use App\Models\SocialPost;
use App\Models\Message;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Validator;
use Laravel\Socialite\Facades\Socialite;
use App\Services\SocialPublisherFactory;
use App\Services\GoogleMyBusinessService;
use Twilio\Rest\Client;

class MarketingController extends Controller
{
    /**
     * Dashboard summary
     */
    public function dashboard()
    {
        $accounts = SocialAccount::orderBy('platform')->get();
        $posts = SocialPost::orderByDesc('created_at')->get();

        $connectedAccounts = $accounts->filter(fn($account) => $account->status === 'connected');
        $scheduledPosts = $posts->filter(fn($post) => $post->status === 'scheduled');

        return response()->json([
            'success' => true,
            'data' => [
                'connected_accounts' => $connectedAccounts->count(),
                'scheduled_posts' => $scheduledPosts->count(),
                'total_followers' => $connectedAccounts->sum('followers_count') ?? 0,
                'total_engagement' => $posts->sum('engagement_count') ?? 0,
                'accounts' => $accounts,
                'posts' => $posts,
            ],
        ]);
    }

    /**
     * List connected social accounts
     */
    public function accounts()
    {
        $accounts = SocialAccount::orderBy('platform')->get();

        $data = $accounts->map(function ($account) {
            // Hide sensitive token data
            $account->access_token = null;
            $account->refresh_token = null;

            $locations = [];
            if ($account->platform === 'google' && $account->status === 'connected') {
                try {
                    $service = app(GoogleMyBusinessService::class);
                    $locations = $service->getLocations($account->getRawOriginal('access_token'));
                } catch (\Exception $e) {
                    \Log::error('Failed to fetch GBP locations for account ' . $account->id . ': ' . $e->getMessage());
                }
            }

            // Merge locations into the account array
            return array_merge($account->toArray(), ['locations' => $locations]);
        });

        return response()->json([
            'success' => true,
            'data' => $data,
        ]);
    }

    /**
     * Initiate OAuth redirect for a platform (keep for completeness, but actual redirect is handled by SocialAuthController)
     */
    public function redirectToProvider($provider)
    {
        $supported = ['facebook', 'twitter', 'instagram', 'linkedin', 'google'];
        if (!in_array($provider, $supported)) {
            return response()->json(['success' => false, 'message' => 'Unsupported platform'], 400);
        }

        if ($provider === 'google') {
            return Socialite::driver('google')
                ->scopes(['https://www.googleapis.com/auth/business.manage'])
                ->stateless()
                ->redirect();
        }

        return Socialite::driver($provider)->stateless()->redirect();
    }

    /**
     * Handle OAuth callback from provider (stateless)
     */
    public function handleProviderCallback($provider)
    {
        $supported = ['facebook', 'twitter', 'instagram', 'linkedin', 'google'];
        if (!in_array($provider, $supported)) {
            return redirect(env('FRONTEND_URL', 'http://localhost:3000') . '/marketing?error=unsupported_platform');
        }

        try {
            if ($provider === 'google') {
                $socialUser = Socialite::driver('google')
                    ->scopes(['https://www.googleapis.com/auth/business.manage'])
                    ->stateless()
                    ->user();
            } else {
                $socialUser = Socialite::driver($provider)->stateless()->user();
            }
        } catch (\Exception $e) {
            return redirect(env('FRONTEND_URL', 'http://localhost:3000') . '/marketing?error=oauth_failed');
        }

        // Store or update the single account (no user_id needed)
        SocialAccount::updateOrCreate(
            ['platform' => $provider],
            [
                'account_name' => $socialUser->getName() ?? $socialUser->getNickname(),
                'username' => $socialUser->getNickname(),
                'platform_user_id' => $socialUser->getId(),
                'access_token' => Crypt::encryptString($socialUser->token),
                'refresh_token' => $socialUser->refreshToken ? Crypt::encryptString($socialUser->refreshToken) : null,
                'token_expires_at' => $socialUser->expiresIn ? now()->addSeconds($socialUser->expiresIn) : null,
                'scopes' => json_encode($socialUser->approvedScopes ?? []),
                'status' => 'connected',
            ]
        );

        return redirect(env('FRONTEND_URL', 'http://localhost:3000') . '/marketing?connected=' . $provider);
    }

    /**
     * Disconnect a social account
     */
    public function disconnectProvider($provider)
    {
        SocialAccount::where('platform', $provider)
            ->update(['status' => 'disconnected', 'access_token' => null, 'refresh_token' => null]);

        return response()->json(['success' => true, 'message' => 'Account disconnected']);
    }

    /**
     * List all posts
     */
    public function posts()
    {
        $posts = SocialPost::orderByDesc('created_at')->get();

        return response()->json([
            'success' => true,
            'data' => $posts,
        ]);
    }

    /**
     * Store a new post (supports JSON or multipart with media)
     */
    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'content' => 'required|string|max:5000',
            'platforms' => 'required',
            'status' => 'nullable|string|in:draft,scheduled,publishing,published,failed,cancelled',
            'scheduled_at' => 'nullable|date',
            'type' => 'nullable|string|max:50',
            'link' => 'nullable|url',
            'cta' => 'nullable|string|max:100',
            'locations' => 'nullable|json',
            'media.*' => 'nullable|file|mimes:jpg,jpeg,png,gif,mp4,mov|max:20480',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $platforms = $request->input('platforms');
        if (is_string($platforms)) {
            $platforms = json_decode($platforms, true);
        }
        if (!is_array($platforms) || count($platforms) === 0) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => ['platforms' => ['At least one platform must be selected.']],
            ], 422);
        }

        $allowedPlatforms = ['facebook', 'twitter', 'instagram', 'linkedin', 'google'];
        foreach ($platforms as $p) {
            if (!in_array($p, $allowedPlatforms)) {
                return response()->json([
                    'success' => false,
                    'message' => 'Validation failed',
                    'errors' => ['platforms' => ["Invalid platform: $p"]],
                ], 422);
            }
        }

        $locations = $request->input('locations');
        if (is_string($locations)) {
            $locations = json_decode($locations, true);
        } else {
            $locations = $locations ?? [];
        }

        $status = $request->input('status', $request->filled('scheduled_at') ? 'scheduled' : 'draft');

        $mediaPaths = [];
        if ($request->hasFile('media')) {
            foreach ($request->file('media') as $file) {
                $path = $file->store('social-media', 'public');
                $mediaPaths[] = $path;
            }
        }

        $post = SocialPost::create([
            'content' => $request->input('content'),
            'status' => $status,
            'scheduled_at' => $request->input('scheduled_at'),
            'media_path' => $mediaPaths[0] ?? null,
            'media_type' => $request->input('type', 'text'),
            'platforms' => $platforms,
            'metadata' => [
                'platforms' => $platforms,
                'locations' => $locations,
                'link' => $request->input('link'),
                'cta' => $request->input('cta'),
                'media_paths' => $mediaPaths,
            ],
        ]);

        if ($status === 'published') {
            $this->publishToPlatforms($post);
        }

        return response()->json([
            'success' => true,
            'message' => 'Post created successfully',
            'data' => $post,
        ], 201);
    }

    /**
     * Update an existing post
     */
    public function update(Request $request, SocialPost $post)
    {
        $validator = Validator::make($request->all(), [
            'content' => 'sometimes|string|max:5000',
            'platforms' => 'sometimes',
            'status' => 'sometimes|string|in:draft,scheduled,publishing,published,failed,cancelled',
            'scheduled_at' => 'nullable|date',
            'type' => 'nullable|string|max:50',
            'link' => 'nullable|url',
            'cta' => 'nullable|string|max:100',
            'locations' => 'nullable|json',
            'media.*' => 'nullable|file|mimes:jpg,jpeg,png,gif,mp4,mov|max:20480',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        if ($request->has('platforms')) {
            $platforms = $request->input('platforms');
            if (is_string($platforms)) {
                $platforms = json_decode($platforms, true);
            }
            if (!is_array($platforms) || count($platforms) === 0) {
                return response()->json([
                    'success' => false,
                    'message' => 'Validation failed',
                    'errors' => ['platforms' => ['At least one platform must be selected.']],
                ], 422);
            }
            $post->platforms = $platforms;
        }

        if ($request->has('locations')) {
            $locations = $request->input('locations');
            if (is_string($locations)) {
                $locations = json_decode($locations, true);
            }
            $metadata = $post->metadata ?? [];
            $metadata['locations'] = $locations;
            $post->metadata = $metadata;
        }

        $post->fill($request->only(['content', 'status', 'scheduled_at', 'type', 'link', 'cta']));
        $post->save();

        if ($request->hasFile('media')) {
            $mediaPaths = [];
            foreach ($request->file('media') as $file) {
                $path = $file->store('social-media', 'public');
                $mediaPaths[] = $path;
            }
            $post->media_path = $mediaPaths[0] ?? null;
            $metadata = $post->metadata ?? [];
            $metadata['media_paths'] = $mediaPaths;
            $post->metadata = $metadata;
            $post->save();
        }

        if ($post->status === 'published' && $post->wasChanged('status')) {
            $this->publishToPlatforms($post);
        }

        return response()->json([
            'success' => true,
            'message' => 'Post updated',
            'data' => $post,
        ]);
    }

    /**
     * Delete a post and optionally remove from platforms
     */
    public function destroy(SocialPost $post)
    {
        if ($post->external_post_ids) {
            foreach ($post->external_post_ids as $platform => $externalId) {
                $publisher = SocialPublisherFactory::make($platform);
                if ($publisher) {
                    $publisher->delete($externalId);
                }
            }
        }

        $post->delete();

        return response()->json([
            'success' => true,
            'message' => 'Post deleted',
        ]);
    }

    /**
     * Calendar endpoint: scheduled posts
     */
    public function calendar()
    {
        $posts = SocialPost::whereNotNull('scheduled_at')
            ->orderBy('scheduled_at')
            ->get();

        return response()->json([
            'success' => true,
            'data' => $posts,
        ]);
    }

    /**
     * Analytics overview
     */
    public function analytics()
    {
        $accounts = SocialAccount::where('status', 'connected')->get();
        $posts = SocialPost::all();

        $followers = $accounts->sum('followers_count') ?? 0;
        $engagement = $posts->sum('engagement_count') ?? 0;

        return response()->json([
            'success' => true,
            'data' => [
                'followers' => $followers,
                'engagement' => $engagement,
                'accounts' => $accounts->count(),
                'message' => $accounts->count() ? 'Analytics data from connected platforms' : 'No connected accounts',
            ],
        ]);
    }

    /**
     * Unified Inbox: return messages from all channels
     */
    public function inbox()
    {
        $messages = Message::orderByDesc('received_at')->paginate(20);

        return response()->json([
            'success' => true,
            'data' => $messages->items(),
            'meta' => [
                'current_page' => $messages->currentPage(),
                'last_page' => $messages->lastPage(),
                'total' => $messages->total(),
            ],
        ]);
    }

    /**
     * Mark a message as read
     */
    public function markMessageRead(Message $message)
    {
        $message->update(['is_read' => true]);
        return response()->json(['success' => true]);
    }

    /**
     * Send email reply
     */
    public function sendEmailReply(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'to' => 'required|email',
            'subject' => 'required|string',
            'body' => 'required|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['success' => false, 'errors' => $validator->errors()], 422);
        }

        \Mail::raw($request->body, function ($message) use ($request) {
            $message->to($request->to)
                ->subject($request->subject);
        });

        return response()->json(['success' => true]);
    }

    /**
     * Send WhatsApp message via Twilio
     */
    public function sendWhatsAppReply(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'to' => 'required|string',
            'body' => 'required|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['success' => false, 'errors' => $validator->errors()], 422);
        }

        try {
            $twilio = new Client(env('TWILIO_SID'), env('TWILIO_AUTH_TOKEN'));
            $twilio->messages->create(
                $request->to,
                [
                    'from' => env('TWILIO_WHATSAPP_FROM'),
                    'body' => $request->body,
                ]
            );
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'message' => 'Failed to send WhatsApp message'], 500);
        }

        return response()->json(['success' => true]);
    }

    /**
     * Helper: Publish a post to all its platforms
     */
    private function publishToPlatforms(SocialPost $post)
    {
        $platforms = $post->platforms ?? [];

        foreach ($platforms as $platform) {
            $account = SocialAccount::where('platform', $platform)
                ->where('status', 'connected')
                ->first();

            if (!$account) continue;

            $publisher = SocialPublisherFactory::make($platform);
            if ($publisher) {
                $success = $publisher->publish($post, $account);
                if ($success) {
                    $external = $post->external_post_ids ?? [];
                    $external[$platform] = $publisher->getLastExternalId();
                    $post->external_post_ids = $external;
                    $post->status = 'published';
                    $post->published_at = now();
                    $post->save();
                } else {
                    $post->status = 'failed';
                    $post->save();
                }
            }
        }
    }
}