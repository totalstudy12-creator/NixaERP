<?php

namespace App\Services;

use App\Models\BackupConnection;
use GuzzleHttp\Client;
use GuzzleHttp\Exception\RequestException;
use Illuminate\Support\Facades\Log;
use RuntimeException;

class GoogleDriveService
{
    private const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
    private const UPLOAD_API_BASE = 'https://www.googleapis.com/upload/drive/v3';

    public function __construct(
        protected GoogleOAuthService $oauthService
    ) {}

    /**
     * Get active connection or throw exception.
     */
    public function getConnection(?BackupConnection $connection = null): BackupConnection
    {
        if ($connection instanceof BackupConnection) {
            return $connection;
        }

        $connection = BackupConnection::where('status', 'connected')
            ->orWhere('is_active', true)
            ->first();

        if (!$connection) {
            throw new RuntimeException('Google Drive is not connected. Please connect Google Drive first.');
        }

        return $connection;
    }

    /**
     * Get authorized Guzzle client with bearer token.
     */
    private function getClient(?BackupConnection $connection = null): Client
    {
        $conn = $this->getConnection($connection);
        $accessToken = $this->oauthService->getValidAccessToken($conn);

        return new Client([
            'headers' => [
                'Authorization' => "Bearer {$accessToken}",
                'Accept' => 'application/json',
            ],
            'timeout' => 120,
        ]);
    }

    /**
     * Retrieve storage quota from Google Drive.
     */
    public function getStorageQuota(?BackupConnection $connection = null): array
    {
        $client = $this->getClient($connection);
        $response = $client->get(self::DRIVE_API_BASE . '/about', [
            'query' => [
                'fields' => 'storageQuota,user',
            ],
        ]);

        $data = json_decode($response->getBody()->getContents(), true);
        $quota = $data['storageQuota'] ?? [];

        $limit = isset($quota['limit']) ? (int) $quota['limit'] : 15 * 1073741824;
        $usage = isset($quota['usage']) ? (int) $quota['usage'] : 0;
        $usageInDrive = isset($quota['usageInDrive']) ? (int) $quota['usageInDrive'] : 0;
        $trash = isset($quota['usageInDriveTrash']) ? (int) $quota['usageInDriveTrash'] : 0;
        $available = max(0, $limit - $usage);
        $percent = ($limit > 0) ? round(($usage / $limit) * 100, 1) : 0;

        return [
            'limit_bytes' => $limit,
            'usage_bytes' => $usage,
            'drive_usage_bytes' => $usageInDrive,
            'free_bytes' => $available,
            'percent_used' => $percent,
            // Format expected by frontend:
            'total_bytes' => $limit,
            'used_bytes' => $usage,
            'trash_bytes' => $trash,
            'available_bytes' => $available,
            'used_percent' => $percent,
            'total_formatted' => $this->formatBytes($limit),
            'used_formatted' => $this->formatBytes($usage),
            'available_formatted' => $this->formatBytes($available),
            'user' => $data['user'] ?? null,
        ];
    }

    /**
     * List folders in Google Drive for folder selection / picker.
     */
    public function listFolders(?BackupConnection $connection = null, int $limit = 50): array
    {
        $client = $this->getClient($connection);

        $response = $client->get(self::DRIVE_API_BASE . '/files', [
            'query' => [
                'q' => "mimeType = 'application/vnd.google-apps.folder' and trashed = false",
                'fields' => 'files(id, name, parents)',
                'pageSize' => min($limit, 100),
                'spaces' => 'drive',
                'supportsAllDrives' => 'true',
                'includeItemsFromAllDrives' => 'true',
            ],
        ]);

        $data = json_decode($response->getBody()->getContents(), true);
        return $data['files'] ?? [];
    }

    /**
     * Ensure a backup folder exists in Drive (finds existing or creates it).
     */
    public function ensureFolder(mixed ...$args): array
    {
        $connection = null;
        $folderName = 'NixaERP Backups';

        if (isset($args[0]) && $args[0] instanceof BackupConnection) {
            $connection = $args[0];
            $folderName = (string) ($args[1] ?? 'NixaERP Backups');
        } elseif (isset($args[0]) && is_string($args[0])) {
            $folderName = $args[0];
        }

        $client = $this->getClient($connection);
        $safeName = str_replace("'", "\\'", $folderName);

        $search = $client->get(self::DRIVE_API_BASE . '/files', [
            'query' => [
                'q' => "name = '{$safeName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
                'fields' => 'files(id, name, parents)',
                'spaces' => 'drive',
                'supportsAllDrives' => 'true',
            ],
        ]);

        $data = json_decode($search->getBody()->getContents(), true);
        $folder = $data['files'][0] ?? null;

        if ($folder) {
            return $folder;
        }

        return $this->createFolder($connection, $folderName);
    }

    /**
     * Verify that the specified folder ID exists and is accessible.
     */
    public function verifyFolderAccess(string $folderId, ?BackupConnection $connection = null): bool
    {
        try {
            $client = $this->getClient($connection);
            $response = $client->get(self::DRIVE_API_BASE . "/files/{$folderId}", [
                'query' => [
                    'fields' => 'id,name,mimeType,trashed',
                    'supportsAllDrives' => 'true',
                ],
            ]);

            $file = json_decode($response->getBody()->getContents(), true);
            return ($file['mimeType'] ?? '') === 'application/vnd.google-apps.folder' && empty($file['trashed']);
        } catch (\Throwable $e) {
            Log::warning('[GoogleDriveService] Folder verification failed', ['folder_id' => $folderId, 'error' => $e->getMessage()]);
            return false;
        }
    }

    /**
     * Create a folder in Google Drive.
     * Supports signatures:
     * - createFolder(BackupConnection $conn, string $name, ?string $parentId = null)
     * - createFolder(string $name, ?string $parentId = null)
     */
    public function createFolder(mixed ...$args): array
    {
        $connection = null;
        $name = 'NixaERP Backups';
        $parentId = null;

        if (isset($args[0]) && $args[0] instanceof BackupConnection) {
            $connection = $args[0];
            $name = (string) ($args[1] ?? 'NixaERP Backups');
            $parentId = isset($args[2]) ? (string) $args[2] : null;
        } else {
            $name = (string) ($args[0] ?? 'NixaERP Backups');
            $parentId = isset($args[1]) ? (string) $args[1] : null;
        }

        $client = $this->getClient($connection);
        $body = [
            'name' => $name,
            'mimeType' => 'application/vnd.google-apps.folder',
        ];

        if ($parentId) {
            $body['parents'] = [$parentId];
        }

        $response = $client->post(self::DRIVE_API_BASE . '/files', [
            'json' => $body,
            'query' => [
                'fields' => 'id,name,parents',
                'supportsAllDrives' => 'true',
            ],
        ]);

        return json_decode($response->getBody()->getContents(), true);
    }

    /**
     * Ensure default production backup folder hierarchy exists:
     * Google Drive / NixaERP Backups / Production Installation / ...
     */
    public function getOrCreateDefaultBackupFolder(): array
    {
        $client = $this->getClient();

        // Check if root folder 'NixaERP Backups' exists
        $searchRoot = $client->get(self::DRIVE_API_BASE . '/files', [
            'query' => [
                'q' => "name = 'NixaERP Backups' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
                'fields' => 'files(id, name)',
                'spaces' => 'drive',
            ],
        ]);
        $rootData = json_decode($searchRoot->getBody()->getContents(), true);
        $rootFolder = $rootData['files'][0] ?? null;

        if (!$rootFolder) {
            $rootFolder = $this->createFolder('NixaERP Backups');
        }

        $rootId = $rootFolder['id'];

        // Subfolder for this installation
        $installationFolder = 'Production Installation';
        $searchSub = $client->get(self::DRIVE_API_BASE . '/files', [
            'query' => [
                'q' => "name = '{$installationFolder}' and '{$rootId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
                'fields' => 'files(id, name)',
                'spaces' => 'drive',
            ],
        ]);
        $subData = json_decode($searchSub->getBody()->getContents(), true);
        $subFolder = $subData['files'][0] ?? null;

        if (!$subFolder) {
            $subFolder = $this->createFolder($installationFolder, $rootId);
        }

        // Save selected folder to connection
        $connection = $this->getConnection();
        $connection->folder_id = $subFolder['id'];
        $connection->folder_name = 'NixaERP Backups / Production Installation';
        $connection->save();

        return $subFolder;
    }

    /**
     * Upload file using Google Drive API v3 Resumable Upload protocol.
     * Supports files of any size with chunked uploads, bounded memory, and automatic resume.
     * Supports signatures:
     * - uploadFileResumable(BackupConnection $conn, string $path, string $name, string $folderId, string $mimeType, ?callable $progress)
     * - uploadFileResumable(string $path, string $name, string $mimeType, string $folderId, ?callable $progress)
     */
    public function uploadFileResumable(mixed ...$args): array
    {
        $connection = null;
        $localFilePath = '';
        $driveFileName = '';
        $mimeType = 'application/octet-stream';
        $folderId = '';
        $onProgress = null;

        if (isset($args[0]) && $args[0] instanceof BackupConnection) {
            $connection = $args[0];
            $localFilePath = (string) ($args[1] ?? '');
            $driveFileName = (string) ($args[2] ?? '');
            $folderId = (string) ($args[3] ?? '');
            $mimeType = (string) ($args[4] ?? 'application/octet-stream');
            $onProgress = $args[5] ?? null;
        } else {
            $localFilePath = (string) ($args[0] ?? '');
            $driveFileName = (string) ($args[1] ?? '');
            $mimeType = (string) ($args[2] ?? 'application/octet-stream');
            $folderId = (string) ($args[3] ?? '');
            $onProgress = $args[4] ?? null;
        }

        if (!file_exists($localFilePath)) {
            throw new RuntimeException("Local file for upload not found: {$localFilePath}");
        }

        $fileSize = filesize($localFilePath);
        $chunkSize = config('backup.chunk_size', 2 * 1024 * 1024); // 2 MiB default

        $conn = $this->getConnection($connection);
        $accessToken = $this->oauthService->getValidAccessToken($conn);

        // Step 1: Initiate Resumable Upload Session
        $initClient = new Client([
            'headers' => [
                'Authorization' => "Bearer {$accessToken}",
                'Content-Type' => 'application/json; charset=UTF-8',
                'X-Upload-Content-Type' => $mimeType,
                'X-Upload-Content-Length' => (string) $fileSize,
            ],
            'timeout' => 60,
        ]);

        $metadata = [
            'name' => $driveFileName,
        ];
        if (!empty($folderId)) {
            $metadata['parents'] = [$folderId];
        }

        try {
            $initResponse = $initClient->post(self::UPLOAD_API_BASE . '/files', [
                'query' => [
                    'uploadType' => 'resumable',
                    'supportsAllDrives' => 'true',
                ],
                'body' => json_encode($metadata),
            ]);
        } catch (RequestException $e) {
            $body = $e->hasResponse() ? $e->getResponse()->getBody()->getContents() : $e->getMessage();
            Log::error('[GoogleDriveService] Failed to initiate resumable upload', ['body' => $body]);
            throw new RuntimeException("Failed to initiate Google Drive upload: {$body}");
        }

        $sessionUrl = $initResponse->getHeaderLine('Location');
        if (empty($sessionUrl)) {
            throw new RuntimeException('Google Drive did not return a resumable upload session location header.');
        }

        // Step 2: Upload in Chunks
        $handle = fopen($localFilePath, 'rb');
        if ($handle === false) {
            throw new RuntimeException("Failed to open local file stream: {$localFilePath}");
        }

        $uploadedBytes = 0;
        $maxRetries = 5;

        try {
            while ($uploadedBytes < $fileSize) {
                $bytesToRead = min($chunkSize, $fileSize - $uploadedBytes);
                $chunkData = fread($handle, $bytesToRead);
                $endByte = $uploadedBytes + strlen($chunkData) - 1;

                $retryCount = 0;
                $chunkSuccess = false;

                while (!$chunkSuccess && $retryCount < $maxRetries) {
                    try {
                        $chunkClient = new Client([
                            'headers' => [
                                'Content-Length' => (string) strlen($chunkData),
                                'Content-Range' => "bytes {$uploadedBytes}-{$endByte}/{$fileSize}",
                                'Content-Type' => $mimeType,
                            ],
                            'timeout' => 90,
                            'http_errors' => false,
                        ]);

                        $chunkResponse = $chunkClient->put($sessionUrl, [
                            'body' => $chunkData,
                        ]);

                        $statusCode = $chunkResponse->getStatusCode();

                        if ($statusCode === 308) {
                            $uploadedBytes += strlen($chunkData);
                            $chunkSuccess = true;

                            if ($onProgress) {
                                $percent = $fileSize > 0 ? round(($uploadedBytes / $fileSize) * 100, 1) : 100.0;
                                $onProgress($uploadedBytes, $fileSize, $percent);
                            }
                        } elseif ($statusCode === 200 || $statusCode === 201) {
                            $uploadedBytes += strlen($chunkData);
                            $resultData = json_decode($chunkResponse->getBody()->getContents(), true);

                            if ($onProgress) {
                                $onProgress($fileSize, $fileSize, 100.0);
                            }

                            return [
                                'id' => $resultData['id'],
                                'name' => $resultData['name'],
                                'size' => $fileSize,
                                'md5Checksum' => $resultData['md5Checksum'] ?? null,
                            ];
                        } else {
                            $retryCount++;
                            $delay = pow(2, $retryCount) + rand(1, 3);
                            Log::warning("[GoogleDriveService] Chunk upload returned {$statusCode}, retrying in {$delay}s...", [
                                'retry' => $retryCount,
                                'range' => "{$uploadedBytes}-{$endByte}/{$fileSize}",
                            ]);
                            sleep($delay);
                        }
                    } catch (\Throwable $err) {
                        $retryCount++;
                        $delay = pow(2, $retryCount) + rand(1, 3);
                        Log::warning("[GoogleDriveService] Chunk network exception: {$err->getMessage()}, retrying in {$delay}s...", [
                            'retry' => $retryCount,
                        ]);
                        sleep($delay);
                    }
                }

                if (!$chunkSuccess) {
                    throw new RuntimeException("Failed to upload chunk {$uploadedBytes}-{$endByte} after {$maxRetries} retries.");
                }
            }
        } finally {
            fclose($handle);
        }

        throw new RuntimeException('Upload loop terminated without receiving final 200/201 response from Google Drive.');
    }

    /**
     * Download file from Google Drive directly to a local path (streaming, bounded memory).
     * Supports signatures:
     * - downloadFile(BackupConnection $conn, string $fileId, string $destinationPath)
     * - downloadFile(string $fileId, string $destinationPath)
     */
    public function downloadFile(mixed ...$args): void
    {
        $connection = null;
        $fileId = '';
        $destinationPath = '';

        if (isset($args[0]) && $args[0] instanceof BackupConnection) {
            $connection = $args[0];
            $fileId = (string) ($args[1] ?? '');
            $destinationPath = (string) ($args[2] ?? '');
        } else {
            $fileId = (string) ($args[0] ?? '');
            $destinationPath = (string) ($args[1] ?? '');
        }

        $dir = dirname($destinationPath);
        if (!is_dir($dir) && !mkdir($dir, 0700, true) && !is_dir($dir)) {
            throw new RuntimeException("Unable to create local download directory: {$dir}");
        }

        $conn = $this->getConnection($connection);
        $accessToken = $this->oauthService->getValidAccessToken($conn);

        $client = new Client([
            'headers' => [
                'Authorization' => "Bearer {$accessToken}",
            ],
            'timeout' => 300,
        ]);

        $response = $client->get(self::DRIVE_API_BASE . "/files/{$fileId}", [
            'query' => [
                'alt' => 'media',
                'supportsAllDrives' => 'true',
            ],
            'sink' => $destinationPath,
        ]);

        if ($response->getStatusCode() !== 200 || !file_exists($destinationPath)) {
            throw new RuntimeException("Failed to download file {$fileId} from Google Drive.");
        }
    }

    /**
     * Delete file from Google Drive.
     * Supports signatures:
     * - deleteFile(BackupConnection $conn, string $fileId)
     * - deleteFile(string $fileId)
     */
    public function deleteFile(mixed ...$args): bool
    {
        $connection = null;
        $fileId = '';

        if (isset($args[0]) && $args[0] instanceof BackupConnection) {
            $connection = $args[0];
            $fileId = (string) ($args[1] ?? '');
        } else {
            $fileId = (string) ($args[0] ?? '');
        }

        try {
            $client = $this->getClient($connection);
            $response = $client->delete(self::DRIVE_API_BASE . "/files/{$fileId}", [
                'query' => [
                    'supportsAllDrives' => 'true',
                ],
            ]);

            return $response->getStatusCode() === 204 || $response->getStatusCode() === 200;
        } catch (\Throwable $e) {
            Log::warning('[GoogleDriveService] Failed to delete file in Drive', ['file_id' => $fileId, 'error' => $e->getMessage()]);
            return false;
        }
    }

    /**
     * Get remote file metadata.
     * Supports signatures:
     * - getFileMetadata(BackupConnection $conn, string $fileId)
     * - getFileMetadata(string $fileId)
     */
    public function getFileMetadata(mixed ...$args): ?array
    {
        $connection = null;
        $fileId = '';

        if (isset($args[0]) && $args[0] instanceof BackupConnection) {
            $connection = $args[0];
            $fileId = (string) ($args[1] ?? '');
        } else {
            $fileId = (string) ($args[0] ?? '');
        }

        try {
            $client = $this->getClient($connection);
            $response = $client->get(self::DRIVE_API_BASE . "/files/{$fileId}", [
                'query' => [
                    'fields' => 'id,name,size,md5Checksum,mimeType,trashed',
                    'supportsAllDrives' => 'true',
                ],
            ]);

            return json_decode($response->getBody()->getContents(), true);
        } catch (\Throwable $e) {
            return null;
        }
    }

    /**
     * Helper to format bytes into readable string.
     */
    private function formatBytes(int $bytes): string
    {
        if ($bytes >= 1073741824) {
            return number_format($bytes / 1073741824, 2) . ' GB';
        }
        if ($bytes >= 1048576) {
            return number_format($bytes / 1048576, 2) . ' MB';
        }
        if ($bytes >= 1024) {
            return number_format($bytes / 1024, 2) . ' KB';
        }
        return $bytes . ' B';
    }
}
