# IMPLEMENT PLAN: Per-Account Proxy

**Branch:** `feature/per-account-proxy`
**Status:** Draft — Ready for Review
**Date:** 2026-09-19

---

## 1. Objective

Allow each WorkBuddy account to have its own HTTP proxy. When an account has a proxy configured, **all** outbound HTTP calls for that account (chat, refresh, checkin, tasks, model discovery, account test) route through that proxy. Accounts without a proxy continue using direct connections — zero behavior change.

---

## 2. Scope

### In-Scope
- Add `proxy` field to Account JSON schema
- Add proxy-aware HTTP helper
- Modify all `urlopen` call sites across 3 files (19 call sites total)
- Import/export support for proxy field
- Panel API: proxy visible in public view, settable via import

### Out-of-Scope
- Proxy authentication testing / health checks
- Proxy rotation / load balancing
- SOCKS proxy support (HTTP/HTTPS only for now)
- CLI argument for global proxy (each account has its own)

---

## 3. Proxy Format

```
protocol://[user:pass@]host:port
```

Examples:
- `http://1.2.3.4:8080`
- `http://user:pass@proxy.example.com:3128`
- `https://myproxy:443`

Field name in JSON: `proxy` (string or null)

---

## 4. File-by-File Changes

### 4.1 `wb_accounts.py` — Account Model + HTTP Helper

#### 4.1.1 `Account.__init__()` (line 136)

Add one line after `self.last_checkin = ...` (line 163):

```python
self.proxy = str(data.get("proxy") or "").strip() or None
```

#### 4.1.2 `Account.to_dict()` (line 165)

Add to the return dict:

```python
"proxy": self.proxy,
```

#### 4.1.3 `Account.public()` (line 185)

Add to the return dict:

```python
"hasProxy": bool(self.proxy),
```

> Note: Do NOT expose `proxy` URL (credentials) in public view. Only expose `hasProxy` boolean.

#### 4.1.4 New helper function `open_url()` (add after `http_json()`, around line 55)

```python
def open_url(req, timeout=30, proxy=None):
    """urlopen with optional per-request proxy.

    When *proxy* is a non-empty string (protocol://user:pass@host:port),
    the request is routed through that proxy.  Otherwise it goes direct.
    """
    if proxy:
        handler = urllib.request.ProxyHandler({"http": proxy, "https": proxy})
        opener = urllib.request.build_opener(handler)
        resp = opener.open(req, timeout=timeout)
        return resp
    return urllib.request.urlopen(req, timeout=timeout)
```

#### 4.1.5 Modify `http_json()` (line 28)

Add `proxy=None` parameter:

```python
def http_json(url, data=None, method=None, headers=None, timeout=30,
              retries=3, backoff=1.0, log=None, proxy=None):
```

Change line 46 from:

```python
with urllib.request.urlopen(req, timeout=timeout) as resp:
```

to:

```python
with open_url(req, timeout=timeout, proxy=proxy) as resp:
```

#### 4.1.6 Modify `Account.refresh()` (line 283)

Line 306 — pass `proxy=self.proxy`:

```python
payload = http_json(url, data=b"{}", method="POST", headers=headers, timeout=30, proxy=self.proxy)
```

#### 4.1.7 Modify `Account.checkin()` (line 333)

Line 340 — pass `proxy=self.proxy`:

```python
payload = http_json(url, data=b"{}", method="POST", headers=headers, timeout=15, proxy=self.proxy)
```

#### 4.1.8 Modify `Account.fetch_credits()` (line 356)

Line 370 — pass `proxy=self.proxy`:

```python
res = http_json(url, data=json.dumps(body).encode(), method="POST", headers=headers, timeout=30, proxy=self.proxy)
```

#### 4.1.9 Modify `AccountPool` login profile fetch (line 730)

Change line 730 from:

```python
with urllib.request.urlopen(req_acct, timeout=15) as resp_acct:
```

to:

```python
with open_url(req_acct, timeout=15) as resp_acct:
```

> Note: This is the login flow — no account exists yet so no proxy is available. This stays direct.

#### 4.1.10 Modify `normalise_import_row()` (line 962)

Add `proxy` to the return dict (line 995):

```python
return {
    ...
    "proxy": str(pick("proxy") or "").strip() or None,
    ...
}
```

---

### 4.2 `wb_proxy.py` — Chat + Discovery + Test

#### 4.2.1 `open_upstream()` (line 1741) — **CRITICAL PATH**

Change lines 1774-1775 from:

```python
req = urllib.request.Request(chat_url, data=body, method="POST",
                             headers=account.headers(purpose="chat"))
try:
    resp = urllib.request.urlopen(req, timeout=600)
```

to:

```python
req = urllib.request.Request(chat_url, data=body, method="POST",
                             headers=account.headers(purpose="chat"))
try:
    resp = open_url(req, timeout=600, proxy=account.proxy)
```

Add import at top of file (or use `wb_accounts.open_url`):

```python
from wb_accounts import open_url
```

#### 4.2.2 `fetch_endpoint_models()` (line 1319)

Change line 1327 from:

```python
with urllib.request.urlopen(req, timeout=30) as resp:
```

to:

```python
with open_url(req, timeout=30, proxy=account.proxy) as resp:
```

#### 4.2.3 Account test endpoint (line 3510)

Change line 3530 from:

```python
with urllib.request.urlopen(req, timeout=30) as resp:
```

to:

```python
with open_url(req, timeout=30, proxy=account.proxy) as resp:
```

#### 4.2.4 Port probe (line 3941)

**NO CHANGE.** This is a localhost health check at startup — never proxied.

---

### 4.3 `wb_tasks.py` — Growth Tasks (12 call sites)

All 12 `urlopen` calls in `wb_tasks.py` operate on a single `account` object. Add proxy support to each.

**Strategy:** Each function that makes HTTP calls already receives an `account` parameter. Use `account.proxy` directly.

Add import at top of file:

```python
from wb_accounts import open_url
```

#### Call site changes:

| Line | Function | Change |
|------|----------|--------|
| 105 | `fetch_growth_tasks()` | `urlopen(req)` → `open_url(req, proxy=account.proxy)` |
| 138 | `fetch_growth_summary()` | `urlopen(req)` → `open_url(req, proxy=account.proxy)` |
| 146 | `fetch_growth_summary()` | `urlopen(req)` → `open_url(req, proxy=account.proxy)` |
| 155 | `fetch_growth_summary()` | `urlopen(req)` → `open_url(req, proxy=account.proxy)` |
| 170 | `claim_task()` | `urlopen(req)` → `open_url(req, proxy=account.proxy)` |
| 182 | `claim_task()` | `urlopen(req)` → `open_url(req, proxy=account.proxy)` |
| 213 | `claim_task()` (web fallback) | `urlopen(req_web)` → `open_url(req_web, proxy=account.proxy)` |
| 312 | `report_events()` | `urlopen(req)` → `open_url(req, proxy=account.proxy)` |
| 325 | `do_cat_travel()` | `urlopen(req)` → `open_url(req, proxy=account.proxy)` |
| 336 | `do_cat_travel()` | `urlopen(req_cl)` → `open_url(req_cl, proxy=account.proxy)` |
| 352 | `do_cat_travel()` | `urlopen(req_cfg)` → `open_url(req_cfg, proxy=account.proxy)` |
| 364 | `do_cat_travel()` | `urlopen(req_dep)` → `open_url(req_dep, proxy=account.proxy)` |

---

## 5. Account JSON Schema (Updated)

```json
{
  "uid": "string",
  "nickname": "string",
  "domain": "string",
  "realm": "intl|cn",
  "platform": "string",
  "enterpriseId": "string",
  "accessToken": "string (JWT)",
  "refreshToken": "string",
  "expiresAt": "number (epoch)",
  "addedAt": "number (epoch)",
  "source": "string",
  "enabled": "boolean",
  "lastError": "string",
  "cooldownUntil": "number (epoch)",
  "credits": "object|null",
  "lastCheckin": "string|null",
  "proxy": "string|null"
}
```

New field: **`proxy`** — format `protocol://[user:pass@]host:port`

---

## 6. API Response Changes

### Panel Public View (`Account.public()`)

```json
{
  "...existing fields...",
  "hasProxy": false
}
```

> Credentials are NOT exposed. Only a boolean indicating whether a proxy is set.

---

## 7. Import/Export

### Export

`Account.to_dict()` now includes `"proxy": "..."` or `"proxy": null`. Exported JSON files will contain the proxy field.

### Import

`normalise_import_row()` picks `proxy` from the row via the existing `pick()` helper. Users can set proxy via:

```json
{
  "accessToken": "...",
  "proxy": "http://user:pass@host:port"
}
```

Or via bulk import:

```json
{
  "format": "workbuddy-accounts",
  "accounts": [
    {
      "accessToken": "...",
      "proxy": "http://1.2.3.4:8080"
    }
  ]
}
```

---

## 8. Backward Compatibility

- **Old accounts (no `proxy` field):** `data.get("proxy")` returns `None` → direct connection. Zero behavior change.
- **Old JSON files:** Proxy field is simply absent. Account loads fine.
- **Old exports:** Imported without proxy — works as before.
- **Panel UI:** Existing UIs ignore unknown fields. `hasProxy: false` is harmless.

No migration script needed.

---

## 9. Implementation Order

| Step | File | Description | Risk |
|------|------|-------------|------|
| 1 | `wb_accounts.py` | `Account.__init__()` — add `self.proxy` | Low |
| 2 | `wb_accounts.py` | `Account.to_dict()` — add `"proxy"` | Low |
| 3 | `wb_accounts.py` | `Account.public()` — add `"hasProxy"` | Low |
| 4 | `wb_accounts.py` | Add `open_url()` helper function | Low |
| 5 | `wb_accounts.py` | `http_json()` — add `proxy` param, use `open_url()` | Low |
| 6 | `wb_accounts.py` | `Account.refresh()` — pass `proxy=self.proxy` | Low |
| 7 | `wb_accounts.py` | `Account.checkin()` — pass `proxy=self.proxy` | Low |
| 8 | `wb_accounts.py` | `Account.fetch_credits()` — pass `proxy=self.proxy` | Low |
| 9 | `wb_accounts.py` | `normalise_import_row()` — add `"proxy"` | Low |
| 10 | `wb_proxy.py` | Add `from wb_accounts import open_url` | Low |
| 11 | `wb_proxy.py` | `open_upstream()` — use `open_url(..., proxy=account.proxy)` | **Medium** |
| 12 | `wb_proxy.py` | `fetch_endpoint_models()` — use `open_url()` | Low |
| 13 | `wb_proxy.py` | Account test endpoint — use `open_url()` | Low |
| 14 | `wb_tasks.py` | Add `from wb_accounts import open_url` | Low |
| 15 | `wb_tasks.py` | 12 urlopen calls → `open_url(..., proxy=account.proxy)` | Low |

---

## 10. Testing Plan

### 10.1 Unit Tests

1. **Account proxy field:**
   - Create Account with `proxy: "http://1.2.3.4:8080"` → `account.proxy == "http://1.2.3.4:8080"`
   - Create Account without proxy → `account.proxy is None`
   - `to_dict()` includes `"proxy"` key
   - `public()` includes `"hasProxy": true/false`, does NOT include proxy URL

2. **`open_url()` helper:**
   - `open_url(req, proxy=None)` → calls `urllib.request.urlopen` (direct)
   - `open_url(req, proxy="http://...")` → calls through proxy

3. **`http_json()` with proxy:**
   - Verify `proxy` parameter is passed through to `open_url()`

4. **`normalise_import_row()`:**
   - Import row with `"proxy"` → kwargs contains proxy
   - Import row without `"proxy"` → kwargs has `"proxy": None`

### 10.2 Integration Tests

1. **Proxy chat request:**
   - Add account with proxy → send chat request → verify routed through proxy

2. **No-proxy fallback:**
   - Account without proxy → send chat request → verify direct connection

3. **Refresh via proxy:**
   - Account with proxy + expired token → verify refresh uses proxy

4. **Task execution via proxy:**
   - CN account with proxy → run growth tasks → verify all HTTP calls use proxy

### 10.3 Manual Test Checklist

- [ ] Start server, add account with proxy via import
- [ ] Verify `GET /accounts` shows `"hasProxy": true`
- [ ] Send chat completion request → verify proxy is used (check proxy logs)
- [ ] Remove proxy from account → verify direct connection
- [ ] Test with proxy that returns 407 → verify graceful error handling
- [ ] Test with unreachable proxy → verify timeout and retry behavior

---

## 11. Error Handling

### Proxy Connection Failures

- `urllib.request.URLError` (connection refused, timeout) → caught by existing exception handlers in `open_upstream()`, `http_json()`, etc.
- Retry logic in `http_json()` already handles transient failures — proxy failures are treated the same way.
- `open_upstream()` already retries with different accounts on failure — proxy failures trigger account rotation naturally.

### Proxy Authentication (407)

- `urllib.error.HTTPError` with code 407 → caught as generic HTTP error
- Account gets cooldown via existing `note_error()` mechanism
- No special 407 handling needed for v1

---

## 12. Security Considerations

- Proxy credentials are stored in account JSON files (same security model as access tokens)
- Proxy credentials are NOT exposed in panel API (`public()` only returns `hasProxy` boolean)
- Proxy URL is persisted to disk via `to_dict()` → `save()`
- No proxy credentials logged (only `account.uid[:8]` in logs)

---

## 13. Performance Impact

- **No proxy:** Zero overhead — `open_url()` with `proxy=None` calls `urlopen()` directly
- **With proxy:** One extra `ProxyHandler` + `build_opener()` per request — negligible
- **Connection pooling:** `urllib.request` does not pool connections by default. Each `open_url()` call creates a new connection. This is acceptable for the current request volume. If needed later, switch to `requests` with `Session` for connection pooling.

---

## 14. Future Enhancements (Out of Scope)

- [ ] Proxy health check / validation before adding account
- [ ] SOCKS5 proxy support (requires `PySocks` or `requests[socks]`)
- [ ] Global proxy fallback (if account has no proxy, use global proxy)
- [ ] Proxy rotation per request (round-robin across multiple proxies)
- [ ] Connection pooling via `requests` library
