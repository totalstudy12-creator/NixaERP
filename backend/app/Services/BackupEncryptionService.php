<?php

namespace App\Services;

use RuntimeException;

class BackupEncryptionService
{
    public const CIPHER_ALGORITHM = 'aes-256-gcm';
    public const IV_LENGTH = 12; // 96-bit nonce for GCM
    public const TAG_LENGTH = 16; // 128-bit authentication tag

    /**
     * Resolve the 256-bit binary key for a given key version.
     */
    public function getKeyForVersion(string $version = 'v1'): string
    {
        $keyring = config('backup.keyring', []);
        $rawKey = $keyring[$version] ?? config('backup.encryption_key');

        if (!empty($rawKey)) {
            // If hex encoded 64 chars (32 bytes)
            if (ctype_xdigit($rawKey) && strlen($rawKey) === 64) {
                return hex2bin($rawKey);
            }
            // If raw 32 bytes
            if (strlen($rawKey) === 32) {
                return $rawKey;
            }
            // Otherwise derive 32-byte key using HKDF
            return hash_hkdf('sha256', $rawKey, 32, 'nixaerp-backup-encryption', $version);
        }

        // Safe fallback derived from Laravel APP_KEY
        $appKey = (string) config('app.key');
        if (str_starts_with($appKey, 'base64:')) {
            $appKey = base64_decode(substr($appKey, 7));
        }

        if (empty($appKey)) {
            throw new RuntimeException('No backup encryption key or application key is configured.');
        }

        return hash_hkdf('sha256', $appKey, 32, 'nixaerp-backup-encryption', $version);
    }

    /**
     * Get the active encryption key version.
     */
    public function getCurrentKeyVersion(): string
    {
        return (string) config('backup.active_key_version', 'v1');
    }

    /**
     * Encrypt a local file using AES-256-GCM authenticated encryption.
     *
     * @param string $inputPath Unencrypted plaintext file
     * @param string $outputPath Destination encrypted file
     * @param string|null $keyVersion Key version (default 'v1')
     * @return array [iv, tag, key_version, sha256_checksum, file_size]
     */
    public function encryptFile(string $inputPath, string $outputPath, ?string $keyVersion = null): array
    {
        if (!file_exists($inputPath)) {
            throw new RuntimeException("Source file for encryption not found: {$inputPath}");
        }

        $version = $keyVersion ?: (string) config('backup.active_key_version', 'v1');
        $key = $this->getKeyForVersion($version);
        $iv = random_bytes(self::IV_LENGTH);

        $plaintext = file_get_contents($inputPath);
        if ($plaintext === false) {
            throw new RuntimeException("Failed to read plaintext file for encryption: {$inputPath}");
        }

        $tag = '';
        $ciphertext = openssl_encrypt(
            $plaintext,
            self::CIPHER_ALGORITHM,
            $key,
            OPENSSL_RAW_DATA,
            $iv,
            $tag,
            $version, // Authenticated Associated Data (AAD)
            self::TAG_LENGTH
        );

        if ($ciphertext === false) {
            throw new RuntimeException('OpenSSL encryption failed: ' . openssl_error_string());
        }

        // Write header + IV + Tag + ciphertext to output for self-contained portability
        $packaged = 'NIXAENC1' . $iv . $tag . $ciphertext;
        if (file_put_contents($outputPath, $packaged) === false) {
            throw new RuntimeException("Failed to write encrypted artifact to: {$outputPath}");
        }

        return [
            'iv' => bin2hex($iv),
            'tag' => bin2hex($tag),
            'key_version' => $version,
            'sha256' => hash_file('sha256', $outputPath),
            'size' => filesize($outputPath),
        ];
    }

    /**
     * Decrypt an AES-256-GCM encrypted artifact with strict tamper verification.
     */
    public function decryptFile(
        string $encryptedPath,
        string $outputPath,
        string $ivHex = '',
        string $tagHex = '',
        string $keyVersion = 'v1'
    ): void {
        if (!file_exists($encryptedPath)) {
            throw new RuntimeException("Encrypted artifact not found: {$encryptedPath}");
        }

        $ciphertext = file_get_contents($encryptedPath);
        if ($ciphertext === false) {
            throw new RuntimeException("Failed to read encrypted file: {$encryptedPath}");
        }

        // If file is already plaintext SQL
        if (str_starts_with($ciphertext, '--') || str_starts_with($ciphertext, '/*') || str_starts_with($ciphertext, 'CREATE') || str_starts_with($ciphertext, 'INSERT')) {
            $dir = dirname($outputPath);
            if (!is_dir($dir) && !mkdir($dir, 0700, true) && !is_dir($dir)) {
                throw new RuntimeException("Failed to create destination directory: {$dir}");
            }
            file_put_contents($outputPath, $ciphertext);
            return;
        }

        $key = $this->getKeyForVersion($keyVersion);

        if (str_starts_with($ciphertext, 'NIXAENC1') && strlen($ciphertext) > (8 + self::IV_LENGTH + self::TAG_LENGTH)) {
            $iv = substr($ciphertext, 8, self::IV_LENGTH);
            $tag = substr($ciphertext, 8 + self::IV_LENGTH, self::TAG_LENGTH);
            $ciphertext = substr($ciphertext, 8 + self::IV_LENGTH + self::TAG_LENGTH);
        } else {
            $iv = !empty($ivHex) ? @hex2bin($ivHex) : false;
            $tag = !empty($tagHex) ? @hex2bin($tagHex) : false;

            if ((!$iv || !$tag) && strlen($ciphertext) > (self::IV_LENGTH + self::TAG_LENGTH)) {
                $iv = substr($ciphertext, 0, self::IV_LENGTH);
                $tag = substr($ciphertext, self::IV_LENGTH, self::TAG_LENGTH);
                $ciphertext = substr($ciphertext, self::IV_LENGTH + self::TAG_LENGTH);
            }
        }

        if (!$iv || !$tag) {
            throw new RuntimeException('Decryption failed: Missing encryption IV or authentication tag.');
        }

        $plaintext = openssl_decrypt(
            $ciphertext,
            self::CIPHER_ALGORITHM,
            $key,
            OPENSSL_RAW_DATA,
            $iv,
            $tag,
            $keyVersion // AAD must match
        );

        if ($plaintext === false) {
            throw new RuntimeException('Decryption failed! The backup artifact has been tampered with, corrupted, or an incorrect encryption key was provided.');
        }

        $dir = dirname($outputPath);
        if (!is_dir($dir) && !mkdir($dir, 0700, true) && !is_dir($dir)) {
            throw new RuntimeException("Failed to create destination directory: {$dir}");
        }

        if (file_put_contents($outputPath, $plaintext) === false) {
            throw new RuntimeException("Failed to write decrypted file to: {$outputPath}");
        }
    }

    /**
     * Encrypt a string/data structure (used for manifests).
     */
    public function encryptString(string $data, ?string $keyVersion = null): array
    {
        $version = $keyVersion ?: (string) config('backup.active_key_version', 'v1');
        $key = $this->getKeyForVersion($version);
        $iv = random_bytes(self::IV_LENGTH);
        $tag = '';

        $ciphertext = openssl_encrypt(
            $data,
            self::CIPHER_ALGORITHM,
            $key,
            OPENSSL_RAW_DATA,
            $iv,
            $tag,
            $version,
            self::TAG_LENGTH
        );

        if ($ciphertext === false) {
            throw new RuntimeException('OpenSSL string encryption failed: ' . openssl_error_string());
        }

        return [
            'ciphertext' => base64_encode($ciphertext),
            'iv' => bin2hex($iv),
            'tag' => bin2hex($tag),
            'key_version' => $version,
        ];
    }

    /**
     * Decrypt an encrypted string/manifest.
     */
    public function decryptString(string|array $payload, ?string $ivHex = null, ?string $tagHex = null, string $keyVersion = 'v1'): string
    {
        if (is_array($payload)) {
            $keyVersion = $payload['key_version'] ?? 'v1';
            $ivHex = $payload['iv'] ?? '';
            $tagHex = $payload['tag'] ?? '';
            $payload = $payload['ciphertext'] ?? '';
        }

        $key = $this->getKeyForVersion($keyVersion);
        $ciphertext = base64_decode($payload);
        $iv = hex2bin($ivHex ?: '');
        $tag = hex2bin($tagHex ?: '');

        $plaintext = openssl_decrypt(
            $ciphertext,
            self::CIPHER_ALGORITHM,
            $key,
            OPENSSL_RAW_DATA,
            $iv,
            $tag,
            $keyVersion
        );

        if ($plaintext === false) {
            throw new RuntimeException('Manifest decryption failed: Authenticated tag mismatch or wrong encryption key.');
        }

        return $plaintext;
    }
}
