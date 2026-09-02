# Purchase Invoice Import - Setup & Testing Guide

## Quick Summary

The purchase invoice import feature requires:
1. ✅ **Backend API running** on http://localhost:8000
2. ✅ **Frontend dev server running** on http://localhost:5174 (NOT Apache)
3. ✅ **Valid authentication** (login first)
4. ✅ **Proper request format** (JSON with required fields)

---

## Step 1: Verify Backend Server is Running

**Check if backend is running:**
```bash
# Terminal 1: In /xampp/htdocs/RaptorERP/backend
php -S localhost:8000 -t public
```

Expected output:
```
[Wed Sep  2 14:51:12 2026] PHP 8.2.12 Development Server (http://localhost:8000) started
```

**Test the backend connection:**
```bash
# In PowerShell or browser
curl -X GET http://localhost:8000/api/status
# Expected response:
# {"status":"ok","service":"Business OS API"}
```

---

## Step 2: Start Frontend Dev Server

**Start the frontend development server:**
```bash
# Terminal 2: In /xampp/htdocs/RaptorERP/frontend
npm run dev
```

Expected output:
```
  VITE v8.1.5  ready in 623 ms

  ➜  Local:   http://localhost:5174/
  ➜  Network: use --host to expose
```

**Important:** The Vite dev server automatically proxies:
- Requests to `/api` → `http://localhost:8000/api`
- This handles the network connectivity for you

---

## Step 3: Login to the Application

1. Open browser: **http://localhost:5174**
2. Click "Login" or navigate to the login page
3. Enter valid credentials (or register if needed)
4. You should see the dashboard after successful login
5. Keep the browser open (session/token persists)

---

## Step 4: Navigate to Purchases & Import

1. In the navigation menu, find **Purchases** or **Purchase Invoices**
2. Click the **Import** button
3. Select your CSV or JSON file with purchase data
4. Review the preview
5. Click **Import**

---

## Step 5: Monitor the Console for Diagnostics

While importing, open **Browser DevTools** (F12 or Right-click → Inspect):

1. Go to **Console** tab
2. Watch for detailed diagnostic messages:
   - ✅ **Success**: "Purchase invoice created successfully with ID: 123"
   - ❌ **Network Error**: Will show detailed diagnostics with possible causes
   - ❌ **Auth Error**: Will indicate permission or session issues

### Example Successful Import Log:
```
[API Request] POST /api/purchase-invoices
  Content-Length: 2543
  Has Auth: true
Purchase created successfully with ID: 45
Row 1 of 3: ✓ Import successful
```

### Example Network Error Log:
```
[API Request] POST /api/purchase-invoices
  Content-Length: 2543
  Has Auth: true
[Network Error] Failed to connect to server
Possible Causes:
  1. Backend server is not running
  2. API server is not accessible at http://localhost:8000/api
  3. Network connectivity issue
  4. CORS policy blocking the request
Error Message: Failed to fetch
```

---

## Common Issues & Solutions

### Issue 1: "Failed to connect to server" or Status 0 Error

**Cause:** Backend server not running or not accessible

**Solution:**
1. Check Terminal 1: Is `php -S localhost:8000 -t public` running?
2. If not, start it: `cd /xampp/htdocs/RaptorERP/backend && php -S localhost:8000 -t public`
3. Verify: http://localhost:8000/api/status should respond with `{"status":"ok"}`

### Issue 2: "Unauthorized" Error (401)

**Cause:** Not logged in or session expired

**Solution:**
1. Go to http://localhost:5174
2. Log in with valid credentials
3. Try the import again

### Issue 3: "Request timeout" Error

**Cause:** Backend is too slow or hanging

**Solution:**
1. Check backend terminal for errors or slow queries
2. Restart the backend server
3. Check database connectivity
4. Look for any large import operations blocking the server

### Issue 4: Import appears to hang

**Cause:** Large file or database transaction in progress

**Solution:**
1. Wait up to 30 seconds (request timeout limit)
2. Check backend terminal for progress messages
3. If it times out, try with a smaller file
4. Check browser console for final error message

---

## Testing Purchase Invoice Import Data Format

### JSON Format Example:
```json
{
  "purchase_number": "PO-2024-001",
  "supplier_id": 1,
  "warehouse_id": 1,
  "branch_id": 1,
  "purchase_date": "2024-09-02",
  "due_date": "2024-10-02",
  "notes": "Test purchase import",
  "items": [
    {
      "product_id": 1,
      "quantity": 100.50,
      "unit_price": 50.00,
      "tax_rate": 5
    }
  ],
  "payments": [
    {
      "amount": 5303.75,
      "payment_method": "cheque",
      "payment_direction": "outgoing",
      "company_id": 1,
      "branch_id": 1
    }
  ]
}
```

### CSV Format Example:
```csv
purchase_number,supplier_id,warehouse_id,purchase_date,items
PO-2024-001,1,1,2024-09-02,"[{""product_id"":1,""quantity"":100.50,""unit_price"":50.00,""tax_rate"":5}]"
```

---

## Troubleshooting Checklist

- [ ] Backend server running on http://localhost:8000?
- [ ] Frontend dev server running on http://localhost:5174?
- [ ] Logged in to the application?
- [ ] Browser console open to watch for errors?
- [ ] API returns 200 status on GET /api/status?
- [ ] Purchase data has all required fields?
- [ ] No typos in supplier_id, product_id, warehouse_id?
- [ ] Quantities are numeric (decimals OK)?

---

## Real-Time Logging

Enhanced API error logging has been added to:
- **api.ts**: Request details, timeouts, network diagnostics
- **PurchasePage.tsx**: Import-specific error handling

All diagnostics are logged to the browser console with:
- Request method and endpoint
- Authorization header presence
- Response status and content
- Detailed error messages and possible causes

---

## Need More Help?

1. Check browser console (F12) for detailed error messages
2. Check backend terminal output for server-side errors
3. Verify both servers are running and accessible
4. Ensure your import data matches the required format
5. Try a simple test purchase with minimal fields first

---

## Next Steps

Once import is working:
- [ ] Test with sample CSV file (start small)
- [ ] Monitor backend logs for import performance
- [ ] Test with larger files if needed
- [ ] Verify imported data in the database
- [ ] Set up automated import if needed
