# Purchase Invoice Import - Quick Diagnostic Script
# Run this script to verify your setup is correct

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "RaptorERP Purchase Invoice Import Test" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Test 1: Backend connectivity
Write-Host "[Test 1] Backend Server Connectivity" -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8000/api/status" `
        -Method Get -UseBasicParsing -ErrorAction Stop
    
    if ($response.StatusCode -eq 200) {
        Write-Host "✅ Backend is running on http://localhost:8000" -ForegroundColor Green
        $content = $response.Content | ConvertFrom-Json
        Write-Host "   Status: $($content.status)" -ForegroundColor Green
        Write-Host "   Service: $($content.service)" -ForegroundColor Green
    } else {
        Write-Host "❌ Backend responded but with status: $($response.StatusCode)" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Cannot connect to backend at http://localhost:8000" -ForegroundColor Red
    Write-Host "   Error: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "   To fix: Run in a new terminal:" -ForegroundColor Yellow
    Write-Host "   cd /xampp/htdocs/RaptorERP/backend" -ForegroundColor Yellow
    Write-Host "   php -S localhost:8000 -t public" -ForegroundColor Yellow
}
Write-Host ""

# Test 2: Frontend dev server
Write-Host "[Test 2] Frontend Dev Server Connectivity" -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:5174/" `
        -Method Get -UseBasicParsing -ErrorAction Stop
    
    Write-Host "✅ Frontend dev server is running on http://localhost:5174" -ForegroundColor Green
    if ($response.Content -like "*React*" -or $response.Content -like "*<!doctype*") {
        Write-Host "   App is properly loaded" -ForegroundColor Green
    }
} catch {
    Write-Host "❌ Frontend dev server not running on http://localhost:5174" -ForegroundColor Red
    Write-Host "   Error: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "   To fix: Run in a new terminal:" -ForegroundColor Yellow
    Write-Host "   cd /xampp/htdocs/RaptorERP/frontend" -ForegroundColor Yellow
    Write-Host "   npm run dev" -ForegroundColor Yellow
}
Write-Host ""

# Test 3: API proxy through frontend dev server
Write-Host "[Test 3] API Proxy Through Frontend Dev Server" -ForegroundColor Yellow
try {
    $headers = @{ 'Accept' = 'application/json' }
    $response = Invoke-WebRequest -Uri "http://localhost:5174/api/status" `
        -Method Get -UseBasicParsing -Headers $headers -ErrorAction Stop
    
    Write-Host "✅ Frontend dev server is proxying /api requests correctly" -ForegroundColor Green
    $content = $response.Content | ConvertFrom-Json
    Write-Host "   Proxied response: $($content | ConvertTo-Json)" -ForegroundColor Green
} catch {
    Write-Host "⚠️  API proxy not accessible through frontend dev server" -ForegroundColor Yellow
    Write-Host "   This might be OK if you're accessing the app directly" -ForegroundColor Yellow
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Yellow
}
Write-Host ""

# Test 4: Check if purchase-invoices endpoint exists
Write-Host "[Test 4] Purchase Invoices Endpoint" -ForegroundColor Yellow
try {
    $headers = @{ 
        'Accept' = 'application/json'
        'Content-Type' = 'application/json'
    }
    
    $response = Invoke-WebRequest -Uri "http://localhost:8000/api/purchase-invoices" `
        -Method Get -UseBasicParsing -Headers $headers -ErrorAction Stop
    
    Write-Host "✅ Endpoint exists and accepted GET request" -ForegroundColor Green
    Write-Host "   Status: $($response.StatusCode)" -ForegroundColor Green
} catch {
    if ($_.Exception.Response.StatusCode.Value__ -eq 401) {
        Write-Host "✅ Endpoint exists (requires authentication)" -ForegroundColor Green
        Write-Host "   Status: 401 Unauthorized (expected - must login first)" -ForegroundColor Green
    } elseif ($_.Exception.Response.StatusCode.Value__ -eq 404) {
        Write-Host "❌ Endpoint not found (404)" -ForegroundColor Red
        Write-Host "   Backend might not have purchase-invoices routes registered" -ForegroundColor Red
    } else {
        Write-Host "⚠️  Endpoint responded with status: $($_.Exception.Response.StatusCode.Value__)" -ForegroundColor Yellow
    }
}
Write-Host ""

# Summary
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "✅ If all tests passed:" -ForegroundColor Green
Write-Host "   1. Open http://localhost:5174 in your browser" -ForegroundColor Green
Write-Host "   2. Log in with valid credentials" -ForegroundColor Green
Write-Host "   3. Navigate to Purchases and try the import" -ForegroundColor Green
Write-Host "   4. Open DevTools (F12) → Console to see diagnostics" -ForegroundColor Green
Write-Host ""
Write-Host "❌ If any tests failed:" -ForegroundColor Red
Write-Host "   1. Follow the instructions above to fix the issue" -ForegroundColor Red
Write-Host "   2. Re-run this script to verify the fix" -ForegroundColor Red
Write-Host ""
