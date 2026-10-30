<?php

namespace App\Services;

use Carbon\Carbon;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Log;

class BankStatementParserService
{
    /**
     * Parse an uploaded bank statement file (CSV, XLSX, XLS, PDF).
     *
     * @param UploadedFile $file
     * @param string $preset 'generic', 'hdfc', 'sbi', 'icici', 'axis', 'pnb'
     * @return array{
     *   success: bool,
     *   bank_format: string,
     *   file_hash: string,
     *   from_date: ?string,
     *   to_date: ?string,
     *   opening_balance: ?float,
     *   closing_balance: ?float,
     *   transactions: array<int, array{
     *     date: string,
     *     value_date: ?string,
     *     description: string,
     *     reference_no: ?string,
     *     debit: float,
     *     credit: float,
     *     balance: ?float,
     *     fingerprint: string
     *   }>,
     *   errors: array<string>,
     *   total_rows: int
     * }
     */
    public function parse(UploadedFile $file, string $preset = 'generic', ?string $password = null): array
    {
        $extension = strtolower($file->getClientOriginalExtension());
        $fileHash = hash_file('sha256', $file->getRealPath());

        if (in_array($extension, ['csv', 'txt'])) {
            return $this->parseCsv($file->getRealPath(), $preset, $fileHash);
        }

        if (in_array($extension, ['xlsx', 'xls'])) {
            return $this->parseExcelOrCsv($file->getRealPath(), $preset, $fileHash);
        }

        if ($extension === 'pdf') {
            return $this->parsePdf($file->getRealPath(), $preset, $fileHash, $password);
        }

        throw new \InvalidArgumentException("Unsupported statement file format: .{$extension}");
    }

    /**
     * Parse raw pasted statement text or CSV rows.
     */
    public function parseTextContent(string $rawText, string $preset = 'generic'): array
    {
        $fileHash = hash('sha256', $rawText);
        $lines = preg_split('/\r?\n/', trim($rawText));

        // Strategy A: Matrix parsing
        $rows = [];
        foreach ($lines as $line) {
            $trimmed = trim($line);
            if (!empty($trimmed)) {
                $cols = preg_split('/\s{2,}|\t|,/', $trimmed);
                if (count($cols) >= 3) {
                    $rows[] = array_map('trim', $cols);
                }
            }
        }

        if (count($rows) >= 2) {
            $matrixResult = $this->processRawRows($rows, $preset, $fileHash);
            if ($matrixResult['success'] && count($matrixResult['transactions']) > 0) {
                return $matrixResult;
            }
        }

        // Strategy B: Deterministic Indian Bank statement line regex matching
        $regexResult = $this->parseTextLinesRegex($lines, $preset, $fileHash);
        if ($regexResult['success'] && count($regexResult['transactions']) > 0) {
            return $regexResult;
        }

        return [
            'success' => false,
            'bank_format' => $preset,
            'file_hash' => $fileHash,
            'from_date' => null,
            'to_date' => null,
            'opening_balance' => null,
            'closing_balance' => null,
            'transactions' => [],
            'errors' => ['Could not recognize transaction lines in the pasted text. Please verify the format contains dates, descriptions, and amounts.'],
            'total_rows' => 0,
        ];
    }

    /**
     * Parse CSV bank statement file.
     */
    public function parseCsv(string $path, string $preset, string $fileHash): array
    {
        $rows = [];
        if (($handle = fopen($path, 'r')) !== false) {
            while (($data = fgetcsv($handle, 4096, ',')) !== false) {
                // If single column with semicolon or tab, try fallback delimiter
                if (count($data) === 1 && isset($data[0])) {
                    if (str_contains($data[0], ';')) {
                        $data = str_getcsv($data[0], ';');
                    } elseif (str_contains($data[0], "\t")) {
                        $data = str_getcsv($data[0], "\t");
                    }
                }
                $rows[] = array_map('trim', $data);
            }
            fclose($handle);
        }

        return $this->processRawRows($rows, $preset, $fileHash);
    }

    /**
     * Simple parser for Excel / CSV stream fallback.
     */
    protected function parseExcelOrCsv(string $path, string $preset, string $fileHash): array
    {
        // Try reading via basic CSV or standard text reader if simple XML/CSV
        // For standard shared hosts without PhpSpreadsheet, parse lines if text-readable
        $content = @file_get_contents($path);
        if ($content && str_contains($content, '<?xml')) {
            // Basic XML sheet parsing for simple xlsx strings
            return $this->parseXmlSpreadsheet($content, $preset, $fileHash);
        }

        return $this->parseCsv($path, $preset, $fileHash);
    }

    /**
     * Basic extraction for text-based PDF bank statements.
     */
    /**
     * Enhanced extraction for text-based, compressed, and AI-assisted PDF bank statements.
     */
    public function parsePdf(string $path, string $preset, string $fileHash, ?string $password = null): array
    {
        $rawContent = @file_get_contents($path);
        if (!$rawContent) {
            return [
                'success' => false,
                'bank_format' => $preset,
                'file_hash' => $fileHash,
                'from_date' => null,
                'to_date' => null,
                'opening_balance' => null,
                'closing_balance' => null,
                'transactions' => [],
                'errors' => ['Unable to read uploaded statement file from disk.'],
                'total_rows' => 0,
            ];
        }

        $isEncrypted = $this->isPdfEncrypted($rawContent);

        if ($isEncrypted && empty($password)) {
            return [
                'success' => false,
                'is_encrypted' => true,
                'bank_format' => $preset,
                'file_hash' => $fileHash,
                'from_date' => null,
                'to_date' => null,
                'opening_balance' => null,
                'closing_balance' => null,
                'transactions' => [],
                'errors' => ['This bank statement PDF is password-protected by your bank. Please enter your statement password in the password field below (such as your Date of Birth, Customer ID, or Account Number) and try again.'],
                'total_rows' => 0,
            ];
        }

        // If password is provided, attempt decryption
        if ($isEncrypted && !empty($password)) {
            $decryptedContent = $this->decryptStandardPdf($rawContent, $password);
            if (!empty($decryptedContent)) {
                $rawContent = $decryptedContent;
            }
        }

        // Extract text using robust binary offset decompression
        $rawText = $this->extractPdfTextRobust($rawContent, $path, $password);

        if (!empty($rawText)) {
            $lines = preg_split('/\r?\n/', $rawText);
            $rows = [];
            foreach ($lines as $line) {
                $trimmed = trim($line);
                if (!empty($trimmed)) {
                    $cols = preg_split('/\s{2,}|\t/', $trimmed);
                    if (count($cols) >= 3) {
                        $rows[] = array_map('trim', $cols);
                    }
                }
            }

            if (count($rows) >= 2) {
                $matrixResult = $this->processRawRows($rows, $preset, $fileHash);
                if ($matrixResult['success'] && count($matrixResult['transactions']) > 0) {
                    return $matrixResult;
                }
            }

            // Strategy B: Deterministic Indian Bank statement line regex matching
            $regexResult = $this->parseTextLinesRegex($lines, $preset, $fileHash);
            if ($regexResult['success'] && count($regexResult['transactions']) > 0) {
                return $regexResult;
            }
        }

        // Strategy C: Multimodal Gemini AI PDF statement extraction (if available)
        $aiResult = $this->parsePdfWithAi($rawText, $path, $preset, $fileHash);
        if ($aiResult['success'] && count($aiResult['transactions']) > 0) {
            return $aiResult;
        }

        $errorMsg = $isEncrypted
            ? 'Could not decrypt or extract text with the provided password. Please check your statement password (often DOB DDMMYYYY or Customer ID) or convert to CSV/XLSX.'
            : 'Could not extract text or transactions from this PDF. Please verify the statement contains digital text (not a scanned image) or convert to CSV/XLSX / use Paste Statement Text.';

        return [
            'success' => false,
            'is_encrypted' => $isEncrypted,
            'bank_format' => $preset,
            'file_hash' => $fileHash,
            'from_date' => null,
            'to_date' => null,
            'opening_balance' => null,
            'closing_balance' => null,
            'transactions' => [],
            'errors' => [$errorMsg],
            'total_rows' => 0,
        ];
    }

    /**
     * Check if PDF file has /Encrypt dictionary.
     */
    public function isPdfEncrypted(string $content): bool
    {
        return (bool) preg_match('/\/Encrypt\s+(?:\d+\s+\d+\s+R|<<)/', $content);
    }

    /**
     * Standard PDF 40-bit/128-bit decryption using Algorithm 3.2.
     */
    protected function decryptStandardPdf(string $content, string $password): ?string
    {
        try {
            // Find /Encrypt dictionary
            if (!preg_match('/\/Encrypt\s+(\d+)\s+(\d+)\s+R/', $content, $encObjMatch)) {
                if (!preg_match('/\/Encrypt\s*<<([^>]*)>>/s', $content, $inlineEnc)) {
                    return null;
                }
                $encDict = $inlineEnc[1];
            } else {
                $encNum = $encObjMatch[1];
                $encGen = $encObjMatch[2];
                if (!preg_match('/' . $encNum . '\s+' . $encGen . '\s+obj\s*<<([^>]*)>>/s', $content, $objDictMatch)) {
                    return null;
                }
                $encDict = $objDictMatch[1];
            }

            $R = preg_match('/\/R\s+(\d+)/', $encDict, $rm) ? (int)$rm[1] : 2;
            $keyLength = preg_match('/\/Length\s+(\d+)/', $encDict, $lm) ? (int)$lm[1] : 40;
            $keyBytes = (int)($keyLength / 8);

            // Extract /O string (owner hash)
            $O = '';
            if (preg_match('/\/O\s*\((.*?)\)/s', $encDict, $om)) {
                $O = $this->decodePdfLiteralString($om[1]);
            } elseif (preg_match('/\/O\s*<([0-9a-fA-F]+)>/', $encDict, $om)) {
                $O = hex2bin($om[1]) ?: '';
            }

            // Extract /P (permissions integer)
            $P = preg_match('/\/P\s+(-?\d+)/', $encDict, $pm) ? (int)$pm[1] : -4;

            // Extract File ID from trailer
            $fileID = '';
            if (preg_match('/\/ID\s*\[\s*<([0-9a-fA-F]+)>/', $content, $idMatch)) {
                $fileID = hex2bin($idMatch[1]) ?: '';
            } elseif (preg_match('/\/ID\s*\[\s*\((.*?)\)/', $content, $idMatch)) {
                $fileID = $idMatch[1];
            }

            // Standard PDF 32-byte padding string
            $padding = "\x28\xBF\x4E\x5E\x4E\x75\x8A\x41\x64\x00\x4E\x56\xFF\xFA\x01\x08\x2E\x2E\x00\xB6\xD0\x68\x3E\x80\x2F\x0C\xA9\xFE\x64\x53\x69\x7A";
            $padded = substr($password . $padding, 0, 32);

            $pBytes = pack('V', $P);
            $hash = md5($padded . $O . $pBytes . $fileID, true);

            if ($R >= 3) {
                for ($i = 0; $i < 50; $i++) {
                    $hash = md5(substr($hash, 0, $keyBytes), true);
                }
            }

            $fileKey = substr($hash, 0, $keyBytes);

            // Decrypt stream blocks in content
            $decryptedContent = $content;
            if (preg_match_all('/(\d+)\s+(\d+)\s+obj(?:\s*<<[^>]*>>)?\s*stream[\r\n]+([\s\S]*?)[\r\n]+endstream/m', $content, $matches, PREG_SET_ORDER)) {
                foreach ($matches as $match) {
                    $objNum = (int)$match[1];
                    $objGen = (int)$match[2];
                    $streamData = $match[3];

                    $objKey = md5($fileKey . pack('V', $objNum)[0] . pack('V', $objNum)[1] . pack('V', $objNum)[2] . pack('v', $objGen)[0] . pack('v', $objGen)[1], true);
                    $keyLen = min($keyBytes + 5, 16);
                    $cipherKey = substr($objKey, 0, $keyLen);

                    // Decrypt with RC4
                    $decryptedStream = $this->rc4Decrypt($cipherKey, $streamData);
                    if ($decryptedStream !== false && strlen($decryptedStream) > 0) {
                        $decryptedContent = str_replace($streamData, $decryptedStream, $decryptedContent);
                    }
                }
            }

            return $decryptedContent;
        } catch (\Throwable $e) {
            return null;
        }
    }

    /**
     * RC4 stream cipher decryption.
     */
    protected function rc4Decrypt(string $key, string $data): string
    {
        $s = range(0, 255);
        $j = 0;
        $keyLen = strlen($key);
        for ($i = 0; $i < 256; $i++) {
            $j = ($j + $s[$i] + ord($key[$i % $keyLen])) % 256;
            $temp = $s[$i];
            $s[$i] = $s[$j];
            $s[$j] = $temp;
        }
        $i = $j = 0;
        $res = '';
        $dataLen = strlen($data);
        for ($y = 0; $y < $dataLen; $y++) {
            $i = ($i + 1) % 256;
            $j = ($j + $s[$i]) % 256;
            $temp = $s[$i];
            $s[$i] = $s[$j];
            $s[$j] = $temp;
            $res .= $data[$y] ^ chr($s[($s[$i] + $s[$j]) % 256]);
        }
        return $res;
    }

    /**
     * Extract text from PDF by decompressing FlateDecode zlib streams, hex strings, and displacement operators.
     */
    public function extractPdfText(string $path, ?string $password = null): string
    {
        $rawContent = @file_get_contents($path);
        if (!$rawContent) return '';

        return $this->extractPdfTextRobust($rawContent, $path, $password);
    }

    /**
     * Robust binary stream extractor for PDF.
     */
    public function extractPdfTextRobust(string $content, ?string $path = null, ?string $password = null): string
    {
        // 1. Try OS pdftotext if available
        if ($path && function_exists('shell_exec')) {
            $nullDev = DIRECTORY_SEPARATOR === '\\' ? '2>nul' : '2>/dev/null';
            $upw = !empty($password) ? ' -upw ' . escapeshellarg($password) : '';
            $cmd = 'pdftotext -layout' . $upw . ' ' . escapeshellarg($path) . ' - ' . $nullDev;
            $output = @shell_exec($cmd);
            if (!empty($output) && strlen(trim($output)) > 40) {
                return $output;
            }
        }

        $extracted = '';

        // 2. Binary offset stream extraction (handles all newlines cleanly)
        $offset = 0;
        while (($streamPos = strpos($content, 'stream', $offset)) !== false) {
            $dataStart = $streamPos + 6;
            if (isset($content[$dataStart]) && $content[$dataStart] === "\r") $dataStart++;
            if (isset($content[$dataStart]) && $content[$dataStart] === "\n") $dataStart++;

            $endstreamPos = strpos($content, 'endstream', $dataStart);
            if ($endstreamPos === false) break;

            $dataLen = $endstreamPos - $dataStart;
            while ($dataLen > 0 && ($content[$dataStart + $dataLen - 1] === "\r" || $content[$dataStart + $dataLen - 1] === "\n")) {
                $dataLen--;
            }

            $stream = substr($content, $dataStart, $dataLen);
            $offset = $endstreamPos + 9;

            // Multi-mode decompression
            $data = @gzuncompress($stream);
            if ($data === false) $data = @gzinflate($stream);
            if ($data === false) $data = @zlib_decode($stream);
            if ($data === false && strlen($stream) > 2) {
                $data = @gzinflate(substr($stream, 2));
            }
            if ($data === false) {
                $data = $stream;
            }

            // Extract operators in stream
            $len = strlen($data);
            $i = 0;
            $lineText = '';

            while ($i < $len) {
                // TJ array: [(...) 100 (...)] TJ
                if ($data[$i] === '[' && preg_match('/^\[(.*?)\]\s*TJ/s', substr($data, $i, 3000), $m)) {
                    $tjContent = $m[1];
                    preg_match_all('/\((.*?)\)|<([0-9a-fA-F]+)>|(-?\d+(?:\.\d+)?)/s', $tjContent, $tokens, PREG_SET_ORDER);
                    foreach ($tokens as $tok) {
                        $rawTok = $tok[0];
                        if ($rawTok[0] === '(') {
                            $lineText .= $this->decodePdfLiteralString(substr($rawTok, 1, -1));
                        } elseif ($rawTok[0] === '<') {
                            $lineText .= $this->decodePdfHexString(substr($rawTok, 1, -1));
                        } elseif (is_numeric($rawTok)) {
                            $num = (float)$rawTok;
                            if ($num <= -180) {
                                $lineText .= "   ";
                            } elseif ($num <= -25) {
                                $lineText .= " ";
                            }
                        }
                    }
                    $i += strlen($m[0]);
                    continue;
                }

                // Tj single string: (text) Tj
                if ($data[$i] === '(' && preg_match('/^\((.*?)\)\s*Tj/s', substr($data, $i, 1000), $m)) {
                    $lineText .= $this->decodePdfLiteralString($m[1]) . ' ';
                    $i += strlen($m[0]);
                    continue;
                }

                // Tj hex string: <hex> Tj
                if ($data[$i] === '<' && preg_match('/^<([0-9a-fA-F]+)>\s*Tj/s', substr($data, $i, 1000), $m)) {
                    $lineText .= $this->decodePdfHexString($m[1]) . ' ';
                    $i += strlen($m[0]);
                    continue;
                }

                // Line break operators: T*, ', ", Td, TD, Tm, ET
                if (preg_match('/^(?:T\*|\'|"|(?:\S+\s+){2,6}(?:Td|TD|Tm)|ET)\b/', substr($data, $i, 80), $m)) {
                    if (trim($lineText) !== '') {
                        $extracted .= trim($lineText) . "\n";
                        $lineText = '';
                    }
                    $i += strlen($m[0]);
                    continue;
                }

                $i++;
            }

            if (trim($lineText) !== '') {
                $extracted .= trim($lineText) . "\n";
            }
        }

        // 3. Fallback uncompressed literal scan if extracted text is sparse
        if (strlen(trim($extracted)) < 40) {
            if (preg_match_all('/\((.*?)\)\s*Tj/s', $content, $literalMatches)) {
                $extracted = implode(' ', array_map([$this, 'decodePdfLiteralString'], $literalMatches[1]));
            }
        }

        return $extracted;
    }

    protected function decodePdfLiteralString(string $str): string
    {
        $str = preg_replace_callback('/\\\\([0-7]{1,3})/', function ($m) {
            return chr(octdec($m[1]));
        }, $str);
        return str_replace(['\\(', '\\)', '\\\\', '\\n', '\\r', '\\t', '\\b', '\\f'], ['(', ')', '\\', "\n", "\r", "\t", "\x08", "\x0C"], $str);
    }

    protected function decodePdfHexString(string $hex): string
    {
        $hex = preg_replace('/\s+/', '', $hex);
        if (strlen($hex) % 2 !== 0) $hex .= '0';
        $bin = @hex2bin($hex);
        if ($bin === false) return '';
        if (str_starts_with($bin, "\xFE\xFF")) {
            return @mb_convert_encoding(substr($bin, 2), 'UTF-8', 'UTF-16BE') ?: '';
        }
        if (strlen($bin) >= 4 && substr_count(substr($bin, 0, 10), "\x00") >= 2) {
            $clean = @mb_convert_encoding($bin, 'UTF-8', 'UTF-16BE');
            if (!empty($clean)) return $clean;
        }
        return $bin;
    }

    /**
     * Line-by-line regex parser for Indian bank statements (HDFC, SBI, ICICI, Axis, PNB, Kotak, BOB).
     */
    protected function parseTextLinesRegex(array $lines, string $preset, string $fileHash): array
    {
        $transactions = [];
        $minDate = null;
        $maxDate = null;
        $openingBalance = null;
        $closingBalance = null;

        // Matches optional Sl No (e.g. "1 ", "#01 "), then Date (DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, DD MMM YYYY, YYYY-MM-DD)
        $datePattern = '/^\s*(?:#?\d+[\.\)\s]+)?(\d{1,2}(?:[\/\-\.]\d{1,2}[\/\-\.]|\s+[a-zA-Z]{3,9}\s+|\-[a-zA-Z]{3,9}\-)\d{2,4}|\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})\s+(.+)$/i';

        foreach ($lines as $line) {
            $line = trim($line);
            if (empty($line)) continue;

            if (!preg_match($datePattern, $line, $m)) continue;

            $dateRaw = $m[1];
            $parsedDate = $this->parseDate($dateRaw);
            if (!$parsedDate) continue;

            $rest = trim($m[2]);

            // Match all monetary values, including optional Cr/Dr or +/- suffix
            preg_match_all('/([0-9,]+\.\d{2})\s*(?:(?:\((cr|dr)\))|(cr|dr)|\b)/i', $rest, $matches, PREG_SET_ORDER);

            if (empty($matches)) continue;

            $debit = 0.00;
            $credit = 0.00;
            $balance = null;
            $count = count($matches);

            if ($count >= 3) {
                // Debit, Credit, Balance
                $debit = $this->parseAmount($matches[0][1]);
                $credit = $this->parseAmount($matches[1][1]);
                $balance = $this->parseAmount($matches[2][1]);
            } elseif ($count === 2) {
                // One transaction amount and one running balance
                $amt = $this->parseAmount($matches[0][1]);
                $balance = $this->parseAmount($matches[1][1]);

                $tag = strtolower($matches[0][2] ?? $matches[0][3] ?? '');
                if ($tag === 'cr') {
                    $credit = $amt;
                } elseif ($tag === 'dr') {
                    $debit = $amt;
                } else {
                    $isDr = preg_match('/\b(dr|debit|with|chq|to\b|w\/d|fee|chg|tax)\b/i', $rest);
                    if ($isDr) {
                        $debit = $amt;
                    } else {
                        $credit = $amt;
                    }
                }
            } elseif ($count === 1) {
                $amt = $this->parseAmount($matches[0][1]);
                $tag = strtolower($matches[0][2] ?? $matches[0][3] ?? '');
                if ($tag === 'cr') {
                    $credit = $amt;
                } elseif ($tag === 'dr') {
                    $debit = $amt;
                } else {
                    $isDr = preg_match('/\b(dr|debit|with|chq|to\b|fee|chg)\b/i', $rest);
                    if ($isDr) $debit = $amt; else $credit = $amt;
                }
            }

            if ($debit <= 0.0001 && $credit <= 0.0001) continue;

            // Clean description and extract reference
            $cleanDesc = trim(preg_replace('/[0-9,]+\.\d{2}\s*(?:(?:\((?:cr|dr)\))|(?:cr|dr)|\b)?/i', '', $rest));
            $cleanDesc = preg_replace('/\s{2,}/', ' ', $cleanDesc);
            $refNo = $this->extractRefFromNarration($cleanDesc) ?: $this->extractRefFromNarration($rest);

            if ($openingBalance === null && $balance !== null) {
                $openingBalance = $credit > 0 ? ($balance - $credit) : ($balance + $debit);
            }
            if ($balance !== null) {
                $closingBalance = $balance;
            }

            $fingerprint = hash('sha256', "{$parsedDate}|{$refNo}|{$debit}|{$credit}|{$balance}");

            $transactions[] = [
                'date' => $parsedDate,
                'value_date' => $parsedDate,
                'description' => substr($cleanDesc ?: 'Bank Transaction', 0, 1000),
                'reference_no' => $refNo ? substr($refNo, 0, 100) : null,
                'debit' => round($debit, 2),
                'credit' => round($credit, 2),
                'balance' => $balance !== null ? round($balance, 2) : null,
                'fingerprint' => $fingerprint,
            ];

            if ($minDate === null || $parsedDate < $minDate) $minDate = $parsedDate;
            if ($maxDate === null || $parsedDate > $maxDate) $maxDate = $parsedDate;
        }

        return [
            'success' => count($transactions) > 0,
            'bank_format' => $preset,
            'file_hash' => $fileHash,
            'from_date' => $minDate,
            'to_date' => $maxDate,
            'opening_balance' => $openingBalance !== null ? round($openingBalance, 2) : 0.00,
            'closing_balance' => $closingBalance !== null ? round($closingBalance, 2) : 0.00,
            'transactions' => $transactions,
            'errors' => [],
            'total_rows' => count($transactions),
        ];
    }

    protected function parsePdfWithAi(string $rawText, string $path, string $preset, string $fileHash): array
    {
        try {
            $aiManager = app()->bound(\App\Services\AiManager::class) ? app(\App\Services\AiManager::class) : null;
            if (!$aiManager) {
                return ['success' => false, 'transactions' => [], 'errors' => []];
            }

            $provider = $aiManager->getPrimaryProvider();
            if (!$provider) {
                return ['success' => false, 'transactions' => [], 'errors' => []];
            }

            $instance = $aiManager->makeProviderInstance($provider);
            $sampleText = substr($rawText, 0, 12000);

            $prompt = <<<PROMPT
You are an expert Indian ERP Bank Statement Parser.
Extract all transaction entries from this Indian bank statement text into a JSON array of objects.
Each object must have:
- "date": string in YYYY-MM-DD format
- "narration": string description
- "reference_no": string UTR, cheque, or ref number or null
- "debit": float withdrawal amount or 0.00
- "credit": float deposit amount or 0.00
- "balance": float or null

Output ONLY a valid raw JSON array starting with [ and ending with ].

Bank Statement Text:
{$sampleText}
PROMPT;

            $resp = $instance->chat([['role' => 'user', 'content' => $prompt]], ['max_tokens' => 4096]);
            $text = trim($resp['message'] ?? '');

            if (preg_match('/\[.*?\]/s', $text, $jsonMatch)) {
                $items = json_decode($jsonMatch[0], true);
                if (is_array($items) && !empty($items)) {
                    $transactions = [];
                    $minDate = null;
                    $maxDate = null;

                    foreach ($items as $it) {
                        $parsedDate = $this->parseDate($it['date'] ?? null);
                        if (!$parsedDate) continue;

                        $debit = (float) ($it['debit'] ?? 0);
                        $credit = (float) ($it['credit'] ?? 0);
                        if ($debit <= 0.001 && $credit <= 0.001) continue;

                        $ref = trim($it['reference_no'] ?? '');
                        $desc = trim($it['narration'] ?? 'Bank Transaction');
                        $bal = isset($it['balance']) && is_numeric($it['balance']) ? (float) $it['balance'] : null;

                        $fingerprint = hash('sha256', "{$parsedDate}|{$ref}|{$debit}|{$credit}|{$bal}");

                        $transactions[] = [
                            'date' => $parsedDate,
                            'value_date' => $parsedDate,
                            'description' => substr($desc, 0, 1000),
                            'reference_no' => $ref ?: null,
                            'debit' => round($debit, 2),
                            'credit' => round($credit, 2),
                            'balance' => $bal !== null ? round($bal, 2) : null,
                            'fingerprint' => $fingerprint,
                        ];

                        if ($minDate === null || $parsedDate < $minDate) $minDate = $parsedDate;
                        if ($maxDate === null || $parsedDate > $maxDate) $maxDate = $parsedDate;
                    }

                    if (count($transactions) > 0) {
                        return [
                            'success' => true,
                            'bank_format' => $preset,
                            'file_hash' => $fileHash,
                            'from_date' => $minDate,
                            'to_date' => $maxDate,
                            'opening_balance' => null,
                            'closing_balance' => null,
                            'transactions' => $transactions,
                            'errors' => [],
                            'total_rows' => count($transactions),
                        ];
                    }
                }
            }
        } catch (\Throwable $e) {
            Log::warning('parsePdfWithAi fallback error: ' . $e->getMessage());
        }

        return ['success' => false, 'transactions' => [], 'errors' => []];
    }

    /**
     * Process raw matrix of rows and extract bank transactions.
     */
    protected function processRawRows(array $rows, string $preset, string $fileHash): array
    {
        $transactions = [];
        $errors = [];
        $headerIndex = -1;
        $columnMap = [];

        // 1. Locate Header Row
        foreach ($rows as $idx => $row) {
            $joined = strtolower(implode(' ', $row));
            if (
                (str_contains($joined, 'date') || str_contains($joined, 'txn date') || str_contains($joined, 'tran date')) &&
                (str_contains($joined, 'debit') || str_contains($joined, 'withdrawal') || str_contains($joined, 'dr')) &&
                (str_contains($joined, 'credit') || str_contains($joined, 'deposit') || str_contains($joined, 'cr'))
            ) {
                $headerIndex = $idx;
                $columnMap = $this->detectColumns($row, $preset);
                break;
            }
        }

        // If header not found by standard names, attempt fallback to row 0 if it looks like columns
        if ($headerIndex === -1 && count($rows) > 1) {
            $headerIndex = 0;
            $columnMap = $this->detectColumns($rows[0], $preset);
        }

        if ($headerIndex === -1 || !isset($columnMap['date'])) {
            return [
                'success' => false,
                'bank_format' => $preset,
                'file_hash' => $fileHash,
                'from_date' => null,
                'to_date' => null,
                'opening_balance' => null,
                'closing_balance' => null,
                'transactions' => [],
                'errors' => ['Header row not detected. Ensure columns contain Date, Narration/Description, Debit/Credit, and Balance.'],
                'total_rows' => count($rows),
            ];
        }

        // 2. Process Data Rows
        $openingBalance = null;
        $closingBalance = null;
        $minDate = null;
        $maxDate = null;

        for ($i = $headerIndex + 1; $i < count($rows); $i++) {
            $row = $rows[$i];
            if (count($row) < 3) continue;

            $dateRaw = $row[$columnMap['date']] ?? null;
            $parsedDate = $this->parseDate($dateRaw);
            if (!$parsedDate) {
                // Skip summary or non-transaction rows (e.g. "Total", "Opening Balance", empty footer)
                continue;
            }

            $descCol = $columnMap['description'] ?? 1;
            $description = trim($row[$descCol] ?? '');
            if (empty($description)) {
                $description = 'Bank Transaction';
            }

            $refCol = $columnMap['reference'] ?? null;
            $refNo = $refCol !== null ? trim($row[$refCol] ?? '') : null;
            if (empty($refNo)) {
                // Try extracting UTR or cheque from narration
                $refNo = $this->extractRefFromNarration($description);
            }

            $debit = 0.00;
            $credit = 0.00;

            if (isset($columnMap['debit']) && isset($columnMap['credit'])) {
                $debit = $this->parseAmount($row[$columnMap['debit']] ?? 0);
                $credit = $this->parseAmount($row[$columnMap['credit']] ?? 0);
            } elseif (isset($columnMap['amount'])) {
                $val = $this->parseAmount($row[$columnMap['amount']] ?? 0);
                $typeCol = $columnMap['type'] ?? null;
                $typeVal = $typeCol !== null ? strtolower(trim($row[$typeCol] ?? '')) : '';
                if ($typeVal === 'dr' || $typeVal === 'debit' || $val < 0) {
                    $debit = abs($val);
                } else {
                    $credit = abs($val);
                }
            }

            // Skip rows with zero amounts
            if ($debit <= 0.0001 && $credit <= 0.0001) {
                continue;
            }

            $balance = null;
            if (isset($columnMap['balance'])) {
                $balance = $this->parseAmount($row[$columnMap['balance']] ?? null);
                if ($openingBalance === null && $balance !== null) {
                    // Approximate opening balance from first row
                    $openingBalance = $credit > 0 ? ($balance - $credit) : ($balance + $debit);
                }
                $closingBalance = $balance;
            }

            // Fingerprint for deduplication
            $fingerprint = hash('sha256', "{$parsedDate}|{$refNo}|{$debit}|{$credit}|{$balance}");

            $transactions[] = [
                'date' => $parsedDate,
                'value_date' => isset($columnMap['value_date']) ? $this->parseDate($row[$columnMap['value_date']] ?? null) : null,
                'description' => substr($description, 0, 1000),
                'reference_no' => $refNo ? substr($refNo, 0, 100) : null,
                'debit' => round($debit, 2),
                'credit' => round($credit, 2),
                'balance' => $balance !== null ? round($balance, 2) : null,
                'fingerprint' => $fingerprint,
            ];

            if ($minDate === null || $parsedDate < $minDate) $minDate = $parsedDate;
            if ($maxDate === null || $parsedDate > $maxDate) $maxDate = $parsedDate;
        }

        return [
            'success' => count($transactions) > 0,
            'bank_format' => $preset,
            'file_hash' => $fileHash,
            'from_date' => $minDate,
            'to_date' => $maxDate,
            'opening_balance' => $openingBalance !== null ? round($openingBalance, 2) : 0.00,
            'closing_balance' => $closingBalance !== null ? round($closingBalance, 2) : 0.00,
            'transactions' => $transactions,
            'errors' => $errors,
            'total_rows' => count($transactions),
        ];
    }

    /**
     * Detect column indices based on header labels.
     */
    protected function detectColumns(array $headerRow, string $preset): array
    {
        $map = [];
        foreach ($headerRow as $idx => $col) {
            $c = strtolower(trim($col));

            if (preg_match('/^(txn date|tran date|transaction date|date|post date)/i', $c) && !isset($map['date'])) {
                $map['date'] = $idx;
            } elseif (preg_match('/^(value date|val date|value dt)/i', $c)) {
                $map['value_date'] = $idx;
            } elseif (preg_match('/(narration|description|particulars|transaction details|remarks)/i', $c) && !isset($map['description'])) {
                $map['description'] = $idx;
            } elseif (preg_match('/(chq|cheque|ref no|reference|utr|rrn|txn id|transaction id)/i', $c) && !isset($map['reference'])) {
                $map['reference'] = $idx;
            } elseif (preg_match('/(withdrawal|debit|dr amount|dr amt|debit amount|dr)/i', $c) && !isset($map['debit'])) {
                $map['debit'] = $idx;
            } elseif (preg_match('/(deposit|credit|cr amount|cr amt|credit amount|cr)/i', $c) && !isset($map['credit'])) {
                $map['credit'] = $idx;
            } elseif (preg_match('/(closing balance|balance|bal)/i', $c) && !isset($map['balance'])) {
                $map['balance'] = $idx;
            } elseif (preg_match('/^(amount|net amount)$/i', $c) && !isset($map['amount'])) {
                $map['amount'] = $idx;
            } elseif (preg_match('/^(type|dr\/cr)$/i', $c)) {
                $map['type'] = $idx;
            }
        }

        // If date not found, default to index 0
        if (!isset($map['date'])) $map['date'] = 0;
        // If description not found, default to index 1 or 2
        if (!isset($map['description'])) $map['description'] = 1;

        return $map;
    }

    /**
     * Clean and parse amount string (e.g. "12,450.00 Cr", "₹ 500.50", "(250)").
     */
    public function parseAmount($value): float
    {
        if ($value === null || $value === '') return 0.00;
        if (is_numeric($value)) return (float) $value;

        $str = (string) $value;
        $isNegative = str_contains($str, '(') || str_contains($str, '-');

        // Remove currency symbols, commas, non-numeric characters except period
        $clean = preg_replace('/[^\d.]/', '', $str);
        if ($clean === '' || !is_numeric($clean)) return 0.00;

        $float = (float) $clean;
        return $isNegative ? -$float : $float;
    }

    /**
     * Parse date string into Y-m-d format safely.
     */
    public function parseDate(?string $value): ?string
    {
        if (empty($value)) return null;

        $clean = trim($value);
        // Common Indian bank date formats: d/m/Y, d-m-Y, d/m/y, Y-m-d, d-M-Y (e.g. 15-Jan-2025)
        $formats = [
            'd/m/Y', 'd-m-Y', 'd/m/y', 'd-m-y',
            'Y-m-d', 'Y/m/d',
            'd-M-Y', 'd/M/Y', 'd M Y',
            'd-M-y', 'd/M/y',
            'j/n/Y', 'j-n-Y',
        ];

        foreach ($formats as $fmt) {
            try {
                $d = Carbon::createFromFormat($fmt, $clean);
                if ($d && $d->year >= 2000 && $d->year <= 2050) {
                    return $d->toDateString();
                }
            } catch (\Throwable $e) {
                // continue
            }
        }

        // Fallback strtotime
        $timestamp = strtotime($clean);
        if ($timestamp && $timestamp > 0) {
            $year = (int) date('Y', $timestamp);
            if ($year >= 2000 && $year <= 2050) {
                return date('Y-m-d', $timestamp);
            }
        }

        return null;
    }

    /**
     * Extract UTR or Reference from Narration (e.g. "UPI/428901234567/PAYTM/...", "NEFT-N123456789-VEND").
     */
    public function extractRefFromNarration(string $narration): ?string
    {
        // 1. UPI 12-digit RRN / UTR
        if (preg_match('/upi\/([0-9]{12})\//i', $narration, $m)) {
            return $m[1];
        }

        // 2. Standard 12-16 alphanumeric UTR (NEFT/RTGS/IMPS)
        if (preg_match('/\b(CMS[0-9]{9,}|N[0-9]{11,}|R[0-9]{11,}|[0-9]{12})\b/i', $narration, $m)) {
            return $m[1];
        }

        // 3. Cheque number
        if (preg_match('/chq(?:no|[\s\.\:])*([0-9]{6})\b/i', $narration, $m)) {
            return $m[1];
        }

        return null;
    }

    /**
     * Parse simple XML spreadsheet content.
     */
    protected function parseXmlSpreadsheet(string $xml, string $preset, string $fileHash): array
    {
        $rows = [];
        if (preg_match_all('/<Row[^>]*>(.*?)<\/Row>/is', $xml, $rowMatches)) {
            foreach ($rowMatches[1] as $rowContent) {
                $cols = [];
                if (preg_match_all('/<Data[^>]*>(.*?)<\/Data>/is', $rowContent, $colMatches)) {
                    foreach ($colMatches[1] as $c) {
                        $cols[] = trim(strip_tags($c));
                    }
                }
                if (!empty($cols)) {
                    $rows[] = $cols;
                }
            }
        }

        return $this->processRawRows($rows, $preset, $fileHash);
    }
}
