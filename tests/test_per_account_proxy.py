"""Tests for the per-account proxy feature.

Covers the unit plan (§10.1) and integration plan (§10.2) from
docs/IMPLEMENT_PLAN_PER_ACCOUNT_PROXY.md. Everything here is offline: the
integration tests stand up an in-process stub HTTP proxy instead of using a
real one.

Run with:
    python -m unittest discover -s tests -v
"""

import base64
import json
import os
import shutil
import socket
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import wb_accounts
import wb_proxy
import wb_tasks


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #

def _b64(obj):
    raw = json.dumps(obj, separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def make_jwt(uid="user-1", iss="https://www.workbuddy.ai", exp=None):
    payload = {"sub": uid, "iss": iss}
    if exp is not None:
        payload["exp"] = exp
    return "%s.%s.%s" % (_b64({"alg": "HS256", "typ": "JWT"}), _b64(payload), "sig")


class FakeResponse(object):
    """Minimal stand-in for an HTTPResponse supporting the `with` protocol."""

    def __init__(self, body=b"{}", status=200):
        self._body = body
        self.status = status

    def read(self, *args):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class StubProxy(object):
    """A tiny in-process HTTP proxy that records the requests it serves.

    urllib sends absolute-URI requests to an HTTP proxy (no CONNECT for plain
    http targets), so the handler records `self.path` verbatim.
    """

    def __init__(self, body=b'{"ok": true}', status=200):
        self.hits = []
        self.body = body
        self.status = status
        self._lock = threading.Lock()
        stub = self

        class Handler(BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.1"

            def _handle(self):
                length = int(self.headers.get("Content-Length") or 0)
                if length:
                    self.rfile.read(length)
                with stub._lock:
                    stub.hits.append({
                        "method": self.command,
                        "path": self.path,
                        "proxy_authorization": self.headers.get("Proxy-Authorization"),
                    })
                self.send_response(stub.status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(stub.body)))
                self.end_headers()
                self.wfile.write(stub.body)

            do_GET = _handle
            do_POST = _handle
            do_CONNECT = _handle

            def log_message(self, *args):
                pass

        self._server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self._server.handle_error = lambda *a, **k: None  # client aborts are expected
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)
        self._thread.start()

    @property
    def url(self):
        host, port = self._server.server_address[:2]
        return "http://%s:%d" % (host, port)

    def hit_count(self):
        with self._lock:
            return len(self.hits)

    def stop(self):
        self._server.shutdown()
        self._server.server_close()


def closed_port():
    """Return a port number that nothing is listening on."""
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


# --------------------------------------------------------------------------- #
# §10.1 Unit tests
# --------------------------------------------------------------------------- #

class AccountProxyFieldTests(unittest.TestCase):
    def test_proxy_roundtrip(self):
        url = "http://1.2.3.4:8080"
        acc = wb_accounts.Account({"uid": "u1", "accessToken": make_jwt(), "proxy": url})
        self.assertEqual(acc.proxy, url)

    def test_missing_proxy_is_none(self):
        acc = wb_accounts.Account({"uid": "u1", "accessToken": make_jwt()})
        self.assertIsNone(acc.proxy)

    def test_whitespace_proxy_is_none(self):
        acc = wb_accounts.Account({"uid": "u1", "accessToken": make_jwt(), "proxy": "   "})
        self.assertIsNone(acc.proxy)

    def test_proxy_is_stripped(self):
        acc = wb_accounts.Account({"uid": "u1", "accessToken": make_jwt(),
                                   "proxy": "  http://1.2.3.4:8080  "})
        self.assertEqual(acc.proxy, "http://1.2.3.4:8080")

    def test_to_dict_contains_proxy(self):
        url = "http://user:pass@1.2.3.4:8080"
        acc = wb_accounts.Account({"uid": "u1", "accessToken": make_jwt(), "proxy": url})
        self.assertEqual(acc.to_dict()["proxy"], url)
        # Absent proxy round-trips as None, not "".
        self.assertIsNone(wb_accounts.Account({"uid": "u1"}).to_dict()["proxy"])

    def test_public_exposes_hasproxy_but_not_url(self):
        url = "http://user:secret@1.2.3.4:8080"
        acc = wb_accounts.Account({"uid": "u1", "accessToken": make_jwt(), "proxy": url})
        pub = acc.public()
        self.assertTrue(pub["hasProxy"])
        self.assertNotIn(url, json.dumps(pub))
        self.assertNotIn("secret", json.dumps(pub))

    def test_public_hasproxy_false_without_proxy(self):
        acc = wb_accounts.Account({"uid": "u1", "accessToken": make_jwt()})
        self.assertFalse(acc.public()["hasProxy"])


class OpenUrlTests(unittest.TestCase):
    def setUp(self):
        self._orig_urlopen = urllib.request.urlopen
        self._orig_build_opener = urllib.request.build_opener
        self.calls = {"urlopen": [], "build_opener": [], "opener_open": []}

    def tearDown(self):
        urllib.request.urlopen = self._orig_urlopen
        urllib.request.build_opener = self._orig_build_opener

    def test_no_proxy_uses_urlopen(self):
        sentinel = FakeResponse()

        def fake_urlopen(req, timeout=None):
            self.calls["urlopen"].append((req, timeout))
            return sentinel

        def fake_build_opener(*handlers):
            self.calls["build_opener"].append(handlers)
            raise AssertionError("build_opener must not be called without a proxy")

        urllib.request.urlopen = fake_urlopen
        urllib.request.build_opener = fake_build_opener

        req = urllib.request.Request("http://example.invalid/x")
        out = wb_accounts.open_url(req, timeout=7)
        self.assertIs(out, sentinel)
        self.assertEqual(len(self.calls["urlopen"]), 1)
        self.assertEqual(self.calls["urlopen"][0][1], 7)
        self.assertEqual(self.calls["build_opener"], [])

    def test_proxy_uses_build_opener(self):
        sentinel = FakeResponse()
        captured = {}

        class FakeOpener(object):
            def open(self, req, timeout=None):
                captured["req"] = req
                captured["timeout"] = timeout
                return sentinel

        def fake_build_opener(*handlers):
            self.calls["build_opener"].append(handlers)
            captured["handlers"] = handlers
            return FakeOpener()

        def fake_urlopen(req, timeout=None):
            self.calls["urlopen"].append((req, timeout))
            raise AssertionError("urlopen must not be called when a proxy is set")

        urllib.request.urlopen = fake_urlopen
        urllib.request.build_opener = fake_build_opener

        req = urllib.request.Request("http://example.invalid/x")
        out = wb_accounts.open_url(req, timeout=9, proxy="http://p:8080")
        self.assertIs(out, sentinel)
        self.assertEqual(captured["timeout"], 9)
        self.assertEqual(self.calls["urlopen"], [])
        handler = captured["handlers"][0]
        self.assertIsInstance(handler, urllib.request.ProxyHandler)
        self.assertEqual(handler.proxies.get("http"), "http://p:8080")
        self.assertEqual(handler.proxies.get("https"), "http://p:8080")

    def test_scheme_less_proxy_normalised(self):
        captured = {}

        class FakeOpener(object):
            def open(self, req, timeout=None):
                return FakeResponse()

        def fake_build_opener(*handlers):
            captured["handlers"] = handlers
            return FakeOpener()

        urllib.request.urlopen = lambda *a, **k: (_ for _ in ()).throw(
            AssertionError("must not call urlopen"))
        urllib.request.build_opener = fake_build_opener

        req = urllib.request.Request("http://example.invalid/x")
        wb_accounts.open_url(req, proxy="1.2.3.4:8080")
        handler = captured["handlers"][0]
        self.assertEqual(handler.proxies.get("http"), "http://1.2.3.4:8080")
        self.assertEqual(handler.proxies.get("https"), "http://1.2.3.4:8080")


class HttpJsonProxyTests(unittest.TestCase):
    def setUp(self):
        self._orig_open_url = wb_accounts.open_url

    def tearDown(self):
        wb_accounts.open_url = self._orig_open_url

    def test_forwards_proxy_and_returns_json(self):
        seen = []

        def fake_open_url(req, timeout=30, proxy=None):
            seen.append({"proxy": proxy, "timeout": timeout})
            return FakeResponse(b'{"code": 0}')

        wb_accounts.open_url = fake_open_url
        out = wb_accounts.http_json("http://example.invalid/x", proxy="http://p:1",
                                    timeout=11)
        self.assertEqual(out, {"code": 0})
        self.assertEqual(seen[0]["proxy"], "http://p:1")
        self.assertEqual(seen[0]["timeout"], 11)

    def test_retries_still_happen_with_proxy(self):
        calls = []

        def fake_open_url(req, timeout=30, proxy=None):
            calls.append(proxy)
            raise urllib.error.URLError("boom")

        wb_accounts.open_url = fake_open_url
        with self.assertRaises(urllib.error.URLError):
            wb_accounts.http_json("http://example.invalid/x", proxy="http://p:1",
                                  retries=3, backoff=0.0)
        self.assertEqual(len(calls), 3)
        self.assertTrue(all(p == "http://p:1" for p in calls))


class AddPreservesProxyTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="wb-proxy-test-")
        self.pool = wb_accounts.AccountPool(self.tmp)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_reimport_without_proxy_preserves(self):
        token = make_jwt(uid="u-preserve")
        self.pool.add(wb_accounts.Account(
            {"uid": "u-preserve", "accessToken": token, "proxy": "http://keep:8080"}))
        self.pool.add(wb_accounts.Account({"uid": "u-preserve", "accessToken": token}))
        self.assertEqual(self.pool.get("u-preserve").proxy, "http://keep:8080")

    def test_reimport_with_proxy_overrides(self):
        token = make_jwt(uid="u-override")
        self.pool.add(wb_accounts.Account(
            {"uid": "u-override", "accessToken": token, "proxy": "http://old:8080"}))
        self.pool.add(wb_accounts.Account(
            {"uid": "u-override", "accessToken": token, "proxy": "http://new:9090"}))
        self.assertEqual(self.pool.get("u-override").proxy, "http://new:9090")


class NormaliseImportRowTests(unittest.TestCase):
    def test_flat_row_with_proxy(self):
        row = {"accessToken": make_jwt(), "proxy": "http://1.2.3.4:8080"}
        kwargs = wb_accounts.normalise_import_row(row)
        self.assertEqual(kwargs["proxy"], "http://1.2.3.4:8080")

    def test_flat_row_without_proxy(self):
        kwargs = wb_accounts.normalise_import_row({"accessToken": make_jwt()})
        self.assertIsNone(kwargs["proxy"])

    def test_whitespace_proxy_normalised(self):
        row = {"accessToken": make_jwt(), "proxy": "   "}
        self.assertIsNone(wb_accounts.normalise_import_row(row)["proxy"])

    def test_nested_account_layer(self):
        row = {"auth": {"accessToken": make_jwt()},
               "account": {"proxy": "http://nested:3128"}}
        self.assertEqual(wb_accounts.normalise_import_row(row)["proxy"],
                         "http://nested:3128")


# --------------------------------------------------------------------------- #
# §10.2 Integration tests (local stub proxy)
# --------------------------------------------------------------------------- #

class IntegrationStubProxyTests(unittest.TestCase):
    def setUp(self):
        self.proxy = StubProxy()
        self.addCleanup(self.proxy.stop)

    def test_open_url_really_tunnels_through_stub(self):
        # A real socket request through the stub: proves the wire path works.
        req = urllib.request.Request("http://example.invalid/echo", method="GET")
        with wb_accounts.open_url(req, timeout=10, proxy=self.proxy.url) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        self.assertEqual(payload, {"ok": True})
        self.assertEqual(self.proxy.hit_count(), 1)
        self.assertIn("example.invalid", self.proxy.hits[0]["path"])

    def test_tasks_route_via_stub_proxy(self):
        acc = wb_accounts.Account({
            "uid": "u-tasks", "accessToken": make_jwt(exp=9999999999),
            "realm": "cn", "proxy": self.proxy.url,
        })
        # Point the task base at a plain-http host so the stub proxy sees the
        # absolute-URI request (HTTPS targets would use CONNECT tunneling). The
        # stub answers it, so the real upstream is never contacted.
        self.proxy.body = b'{"code": 0, "data": {"tasks": []}}'
        orig_base = wb_tasks.CHAT_BASE
        wb_tasks.CHAT_BASE = "http://upstream.invalid"
        try:
            result = wb_tasks.fetch_growth_tasks(acc)
        finally:
            wb_tasks.CHAT_BASE = orig_base
        self.assertEqual(result, [])
        self.assertEqual(self.proxy.hit_count(), 1)
        self.assertEqual(self.proxy.hits[0]["path"],
                         "http://upstream.invalid/v2/activity/growth/tasks")

    def test_account_without_proxy_does_not_hit_stub(self):
        acc = wb_accounts.Account({
            "uid": "u-direct", "accessToken": make_jwt(exp=9999999999),
            "realm": "cn",
        })
        self.assertIsNone(acc.proxy)
        # Intercept the direct urlopen so the test stays offline; the stub must
        # never be contacted.
        orig = urllib.request.urlopen

        def fake_direct(req, timeout=None):
            return FakeResponse(b'{"code": 0, "data": {"tasks": []}}')

        urllib.request.urlopen = fake_direct
        try:
            result = wb_tasks.fetch_growth_tasks(acc)
        finally:
            urllib.request.urlopen = orig
        self.assertEqual(result, [])
        self.assertEqual(self.proxy.hit_count(), 0)

    def test_broken_proxy_fails_closed(self):
        req = urllib.request.Request("http://example.invalid/echo")
        bad = "http://127.0.0.1:%d" % closed_port()
        with self.assertRaises(urllib.error.URLError):
            wb_accounts.open_url(req, timeout=5, proxy=bad)

    def test_broken_proxy_does_not_crash_chat(self):
        """open_upstream() with a dead proxy must fail gracefully (no crash)."""
        tmp = tempfile.mkdtemp(prefix="wb-proxy-chat-")
        self.addCleanup(shutil.rmtree, tmp, True)
        pool = wb_accounts.AccountPool(tmp)
        pool.add(wb_accounts.Account({
            "uid": "u-dead", "accessToken": make_jwt(exp=9999999999),
            "realm": "intl",
            "proxy": "http://127.0.0.1:%d" % closed_port(),
        }))
        orig_pool = wb_proxy.POOL
        wb_proxy.POOL = pool
        try:
            with self.assertRaises(Exception):
                wb_proxy.open_upstream({"model": "gpt-5.6-sol",
                                        "messages": [{"role": "user", "content": "hi"}]},
                                       target_realm="intl")
        finally:
            wb_proxy.POOL = orig_pool
        # The account took a cooldown rather than the process crashing.
        self.assertNotEqual(pool.get("u-dead").last_error, "")


if __name__ == "__main__":
    unittest.main(verbosity=2)
