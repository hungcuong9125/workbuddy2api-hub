# IMPLEMENT PLAN: Per-Account Proxy

**Branch:** `feature/per-account-proxy`
**Status:** Reviewed — Ready for Implementation
**Date:** 2026-09-20 (revised)
**Reviewed against source:** `wb_accounts.py`, `wb_proxy.py`, `wb_tasks.py` @ commit `fe798a0`

---

## 1. Objective

Allow each WorkBuddy account to have its own HTTP proxy. When an account has a
proxy configured, **all** outbound HTTP calls for that account (chat, refresh,
checkin, credits, tasks, model discovery, account test) route through that
proxy. Accounts without a proxy continue using direct connections — zero
behavior change. Goal: isolate each account behind a distinct egress IP to avoid
spam/abuse flags.

---

## 2. Scope

### In-Scope
- Add `proxy` field to the Account model (persisted, import/export).
- Add a proxy-aware HTTP helper `open_url()` in `wb_accounts.py`.
- Route every per-account `urlopen` call site through the proxy (3 files).
- Preserve an existing proxy when an account is re-imported without one.
- Panel API: expose `hasProxy` (boolean) in the public view; set the URL via import.

### Out-of-Scope
- Proxy authentication testing / active health checks.
- Proxy rotation / load balancing.
- SOCKS proxy support (HTTP/HTTPS `CONNECT` tunneling only).
- Global/CLI proxy fallback (each account owns its proxy).
- Dashboard inline proxy editor (import-only for v1 — see §14).

---

## 3. Proxy Format

```
protocol://[user:pass@]host:port
```

Examples:
- `http://1.2.3.4:8080`
- `http://user:pass@proxy.example.com:3128`
- `https://myproxy.example.com:443`

Field name in JSON: `proxy` (string or `null`).

**Normalization rule (implemented in `open_url`):** if the stored value has no
`://` scheme, prepend `http://` so bare `host:port` still routes. A value whose
scheme is not `http`/`https` (e.g. `socks5://`) is passed to `ProxyHandler`
unchanged; since SOCKS is unsupported it will fail closed with a `URLError`
(caught by existing handlers), never fall back to direct.

---

## 4. File-by-File Changes

> ⚠️ Line numbers below are verified against the current tree but **treat them
> as hints, not contracts** — anchor edits on the quoted code / function name,
> not the number.

### 4.1 `wb_accounts.py` — Account Model + HTTP Helper

Imports already present: `urllib.error`, `urllib.parse`, `urllib.request` (lines 8–10). No new import needed.

#### 4.1.1 `Account.__init__()` (def @ line 136)

Add after `self.last_checkin = data.get("lastCheckin") or None` (line 163):

```python
self.proxy = str(data.get("proxy") or "").strip() or None
```

#### 4.1.2 `Account.to_dict()` (def @ line 172)

Add to the returned dict (after `"lastCheckin": self.last_checkin,`, line 189):

```python
"proxy": self.proxy,
```

#### 4.1.3 `Account.public()` (def @ line 192)

Add to the returned dict (e.g. after `"lastCheckin": self.last_checkin,`, line 212):

```python
"hasProxy": bool(self.proxy),
```

> Do **NOT** expose the `proxy` URL (it may embed credentials). Only expose the boolean.

#### 4.1.4 New helper `open_url()` (add immediately after `http_json()`, i.e. after line 55)

```python
def open_url(req, timeout=30, proxy=None):
    """urlopen with an optional per-request proxy.

    When *proxy* is a non-empty string the request is tunneled through it;
    otherwise it uses the default opener (direct, honoring any env proxy just
    like before). A bare "host:port" is treated as an http proxy. The returned
    object is a normal HTTPResponse and supports the `with` statement, so all
    call sites work whether or not a proxy is set.
    """
    if proxy:
        p = proxy if "://" in proxy else "http://" + proxy
        handler = urllib.request.ProxyHandler({"http": p, "https": p})
        opener = urllib.request.build_opener(handler)
        return opener.open(req, timeout=timeout)
    return urllib.request.urlopen(req, timeout=timeout)
```

#### 4.1.5 Modify `http_json()` (def @ line 28)

Add a `proxy=None` parameter to the signature (line 28–29):

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

#### 4.1.6 `Account._refresh_locked()` (http_json call @ line 335)

Pass the proxy:

```python
payload = http_json(url, data=b"{}", method="POST", headers=headers, timeout=30, proxy=self.proxy)
```

#### 4.1.7 `Account.checkin()` (http_json call @ line 369)

```python
payload = http_json(url, data=b"{}", method="POST", headers=headers, timeout=15, proxy=self.proxy)
```

#### 4.1.8 `Account.fetch_credits()` (http_json call @ line 399)

```python
res = http_json(url, data=json.dumps(body).encode(), method="POST", headers=headers, timeout=30, proxy=self.proxy)
```

#### 4.1.9 `AccountPool` login profile fetch (urlopen @ line 759)

**NO CHANGE.** This runs during the OAuth login poll, before an `Account`
object exists, so there is no `account.proxy` to use. Leave it direct.
(The plan previously flagged this as line 730; it is now 759.)

#### 4.1.10 Preserve proxy on re-import — `AccountPool.add()` (def @ line 541)

`import_rows(overwrite=True)` rebuilds the account from the row, so a re-import
that omits `proxy` would silently wipe a configured proxy. `add()` already
preserves `credits` and `last_checkin` this way — mirror that. After the
`last_checkin` preservation block (line 549–550) add:

```python
if not account.proxy and existing.proxy:
    account.proxy = existing.proxy
```

#### 4.1.11 `normalise_import_row()` (def @ line 991)

Add `proxy` to the returned kwargs dict (inside the `return { ... }` @ line 1024):

```python
"proxy": str(pick("proxy") or "").strip() or None,
```

> `pick()` already reads from the flat row, the `auth` layer, and the `account`
> layer, so `proxy` is picked up from any of them.

---

### 4.2 `wb_proxy.py` — Chat + Discovery + Test

Add near the other `wb_accounts` usage (module already does `import wb_accounts` @ line 36). Prefer a top-level import so it is unambiguous:

```python
from wb_accounts import open_url
```

(`wb_accounts` does **not** import `wb_proxy`/`wb_tasks`, so there is no circular-import risk.)

#### 4.2.1 `open_upstream()` chat call — **CRITICAL PATH** (urlopen @ line 1968)

`account` is in scope (assigned @ line 1950). Change line 1968 from:

```python
resp = urllib.request.urlopen(req, timeout=600)
```

to:

```python
resp = open_url(req, timeout=600, proxy=account.proxy)
```

> This returns a streaming response used later without a `with` block — `open_url` returns the response object directly, so behavior is unchanged.

#### 4.2.2 `fetch_endpoint_models()` (urlopen @ line 1470)

`account = POOL.pick(realm="intl")` is in scope (line 1462). Change line 1470 from:

```python
with urllib.request.urlopen(req, timeout=30) as resp:
```

to:

```python
with open_url(req, timeout=30, proxy=account.proxy) as resp:
```

#### 4.2.3 Account test endpoint (urlopen @ line 3950)

`account` is in scope (line 3935). Change line 3950 from:

```python
with urllib.request.urlopen(req, timeout=30) as resp:
```

to:

```python
with open_url(req, timeout=30, proxy=account.proxy) as resp:
```

#### 4.2.4 Port probe (urlopen @ line 4454)

**NO CHANGE.** Localhost startup health check — never proxied.

---

### 4.3 `wb_tasks.py` — Growth Tasks (12 call sites)

Every function that makes HTTP calls takes `account` as its first parameter, so
`account.proxy` is always in scope. Add the import at the top (after the
existing `import urllib.request`):

```python
from wb_accounts import open_url
```

#### Call-site changes (verified line → function):

| Line | Function | Change |
|------|----------|--------|
| 105 | `fetch_growth_tasks()` | `urlopen(req, timeout=15)` → `open_url(req, timeout=15, proxy=account.proxy)` |
| 138 | `fetch_growth_summary()` | `urlopen(req, timeout=10)` → `open_url(req, timeout=10, proxy=account.proxy)` |
| 146 | `fetch_growth_summary()` | `urlopen(req, timeout=10)` → `open_url(req, timeout=10, proxy=account.proxy)` |
| 155 | `fetch_growth_summary()` | `urlopen(req, timeout=10)` → `open_url(req, timeout=10, proxy=account.proxy)` |
| 182 | `accept_tasks()` | `urlopen(req, timeout=15)` → `open_url(req, timeout=15, proxy=account.proxy)` |
| 229 | `claim_task()` | `urlopen(req, timeout=15)` → `open_url(req, timeout=15, proxy=account.proxy)` |
| 260 | `claim_task()` (web fallback) | `urlopen(req_web, timeout=15)` → `open_url(req_web, timeout=15, proxy=account.proxy)` |
| 359 | `report_events()` | `urlopen(req, timeout=15)` → `open_url(req, timeout=15, proxy=account.proxy)` |
| 372 | `do_cat_travel()` | `urlopen(req, timeout=10)` → `open_url(req, timeout=10, proxy=account.proxy)` |
| 383 | `do_cat_travel()` | `urlopen(req_cl, timeout=10)` → `open_url(req_cl, timeout=10, proxy=account.proxy)` |
| 397 | `do_cat_travel()` | `urlopen(req_cfg, timeout=10)` → `open_url(req_cfg, timeout=10, proxy=account.proxy)` |
| 409 | `do_cat_travel()` | `urlopen(req_dep, timeout=10)` → `open_url(req_dep, timeout=10, proxy=account.proxy)` |

> Keep each existing `timeout=` value — do not collapse them to the default.

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

New field: **`proxy`** — format `protocol://[user:pass@]host:port`.

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

## 7. Import / Export

### Export
`Account.to_dict()` now includes `"proxy"` (string or `null`); exported files carry it.

### Import
`normalise_import_row()` picks `proxy` via the existing `pick()` helper. Set it per row:

```json
{ "accessToken": "...", "proxy": "http://user:pass@host:port" }
```

or in bulk:

```json
{
  "format": "workbuddy-accounts",
  "accounts": [
    { "accessToken": "...", "proxy": "http://1.2.3.4:8080" }
  ]
}
```

Re-importing an existing account **with `overwrite=true` but no `proxy`** keeps
the previously configured proxy (see §4.1.10). To *clear* a proxy, import with
`"proxy": ""`/`null` — this sets it to `None` because `add()` only preserves
when the incoming account has no proxy AND the value is falsy; if you must
support explicit clearing, do it through the (future) edit endpoint.

> ⚠️ Note the clearing caveat above is an intentional v1 limitation — document it for support.

---

## 8. Backward Compatibility

- Old accounts (no `proxy`): `data.get("proxy")` → `None` → direct. Zero change.
- Old JSON files: field absent, loads fine.
- Old exports: import as before.
- Panel UIs ignore unknown fields; `hasProxy: false` is harmless.

No migration script needed.

---

## 9. Implementation Order

| Step | File | Description | Risk |
|------|------|-------------|------|
| 1 | `wb_accounts.py` | `__init__` — add `self.proxy` | Low |
| 2 | `wb_accounts.py` | `to_dict()` — add `"proxy"` | Low |
| 3 | `wb_accounts.py` | `public()` — add `"hasProxy"` | Low |
| 4 | `wb_accounts.py` | Add `open_url()` helper (with scheme normalization) | Low |
| 5 | `wb_accounts.py` | `http_json()` — add `proxy` param, call `open_url()` | Low |
| 6 | `wb_accounts.py` | `_refresh_locked()` — pass `proxy=self.proxy` | Low |
| 7 | `wb_accounts.py` | `checkin()` — pass `proxy=self.proxy` | Low |
| 8 | `wb_accounts.py` | `fetch_credits()` — pass `proxy=self.proxy` | Low |
| 9 | `wb_accounts.py` | `add()` — preserve existing proxy on re-import | Low |
| 10 | `wb_accounts.py` | `normalise_import_row()` — add `"proxy"` | Low |
| 11 | `wb_proxy.py` | `from wb_accounts import open_url` | Low |
| 12 | `wb_proxy.py` | `open_upstream()` chat — `open_url(..., proxy=account.proxy)` | **Medium** |
| 13 | `wb_proxy.py` | `fetch_endpoint_models()` — `open_url()` | Low |
| 14 | `wb_proxy.py` | Account test — `open_url()` | Low |
| 15 | `wb_tasks.py` | `from wb_accounts import open_url` | Low |
| 16 | `wb_tasks.py` | 12 `urlopen` calls → `open_url(..., proxy=account.proxy)` | Low |

---

## 10. Testing Plan

### 10.1 Unit Tests (no network; mock `urllib`)

1. **Account proxy field**
   - `Account({"accessToken": <jwt>, "proxy": "http://1.2.3.4:8080"}).proxy == "http://1.2.3.4:8080"`
   - `Account({"accessToken": <jwt>}).proxy is None`
   - Whitespace-only proxy → `None`.
   - `to_dict()` contains `"proxy"`.
   - `public()` contains `"hasProxy": True/False` and **does not** contain any key equal to the proxy URL.

2. **`open_url()`** (monkeypatch `urllib.request.build_opener` and `urllib.request.urlopen`)
   - `proxy=None` → `urllib.request.urlopen` called; `build_opener` not called.
   - `proxy="http://p:8080"` → `build_opener` called with a `ProxyHandler`; `urlopen` not called.
   - `proxy="1.2.3.4:8080"` (no scheme) → `ProxyHandler` receives `http://1.2.3.4:8080` for both `http` and `https`.
   - Returned object is the opener/urlopen return value (supports `with`).

3. **`http_json(proxy=...)`** — monkeypatch `open_url`; assert the `proxy` kwarg is forwarded, and retries still call it `retries` times on a retryable error.

4. **`add()` proxy preservation**
   - Pool has account A with `proxy=P`. `add(Account({...same uid..., no proxy}))` → A still has `proxy=P`.
   - Same but new account carries `proxy=Q` → result is `Q` (override wins).

5. **`normalise_import_row()`**
   - Row with `"proxy"` → kwargs `["proxy"]` set.
   - Row without `"proxy"` → kwargs `["proxy"] is None`.
   - Nested shape (`auth`/`account` layer carries proxy) → picked up.

### 10.2 Integration Tests (local stub proxy)

Stand up a tiny in-process HTTP proxy (a `ThreadingHTTPServer` that records the
`CONNECT`/absolute-URI requests it receives) and point an account at it.

1. **Chat routes via proxy** — account with proxy → `open_upstream()` → stub proxy records a hit; account without proxy → no hit.
2. **Refresh via proxy** — expired token + proxy → refresh request seen at the stub.
3. **Tasks via proxy** — CN account with proxy → each `wb_tasks` HTTP call seen at the stub.
4. **Failure path** — proxy pointed at a closed port → `URLError`/timeout is caught by the existing handlers; chat rotates accounts, `http_json` retries then raises, no crash.

### 10.3 Manual Checklist

- [ ] Start server; import an account with `"proxy": "http://user:pass@host:port"`.
- [ ] `GET /accounts` (or panel) shows `"hasProxy": true` and never leaks the URL.
- [ ] Send a chat completion → confirm egress IP is the proxy's (proxy access log / an IP-echo model prompt).
- [ ] Re-import the same account (overwrite) **without** proxy → proxy is retained.
- [ ] Import with `"proxy": ""` → proxy cleared / `hasProxy: false`.
- [ ] Point at an unreachable proxy → request fails gracefully, account cooldown/rotation kicks in, server stays up.
- [ ] Confirm no proxy credentials appear in logs.

---

## 11. Error Handling

- `urllib.error.URLError` (refused/timeout via proxy) → already retryable in
  `http_json` (`_retryable` returns `True` for `URLError`/`OSError`) and caught
  by `open_upstream`'s per-account rotation.
- Proxy auth failure surfaces as `HTTPError 407` → caught by the generic
  `HTTPError`/`except Exception` handlers; the account takes a cooldown via
  `note_error`. No special-casing in v1.
- `open_url` never silently falls back to direct on a proxy error — a broken
  proxy fails closed, which is the desired anti-leak behavior.

---

## 12. Security Considerations

- Proxy credentials live in account JSON (same trust level as tokens); persisted via `to_dict()`→`save()`.
- Never exposed in `public()` (only `hasProxy`).
- Never logged (logs already use `account.uid[:8]` only — do not add proxy to any log line).
- Fail-closed: if the proxy is down, the request errors instead of leaking to a direct connection.

---

## 13. Performance Impact

- No proxy: zero overhead (`open_url` → plain `urlopen`).
- With proxy: one `ProxyHandler` + `build_opener` per request — negligible.
- `urllib` does not pool connections; each call opens a new one, unchanged from today. Revisit with `requests.Session` only if volume demands it.

---

## 14. Future Enhancements (Out of Scope)

- [ ] Dashboard inline proxy editor + a `PATCH /accounts/{uid}` endpoint to set/clear/test a proxy without a full re-import (recommended next step — closes the UX gap; import-only is fine for v1).
- [ ] Proxy health check / validation before saving.
- [ ] SOCKS5 support (needs `PySocks`).
- [ ] Global proxy fallback.
- [ ] Per-request proxy rotation across a pool.
- [ ] Connection pooling via `requests`.

---

## 15. Reviewer Notes (what changed vs. the draft)

1. **All line numbers re-verified** against `fe798a0`; the draft's numbers were
   from an older tree (e.g. login fetch 730→759, chat 1774→1968, discovery
   1327→1470, account test 3530→3950, and the `wb_tasks` table mislabeled
   `accept_tasks`/`claim_task`). Edits are now anchored on quoted code.
2. **Added §4.1.10** — preserve an existing proxy on `overwrite` re-import, so a
   token refresh via import can't wipe the proxy (mirrors the existing
   `credits`/`last_checkin` preservation in `add()`).
3. **`open_url` now normalizes** a scheme-less `host:port` to `http://…` and
   **fails closed** (never silently direct) on a bad proxy.
4. **Confirmed no circular import** — `wb_accounts` imports neither `wb_proxy`
   nor `wb_tasks`, so `from wb_accounts import open_url` is safe in both.
5. **Integration tests rewritten** to use a local stub proxy (deterministic,
   offline) instead of a live proxy.
