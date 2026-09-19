"""Manual check: prove per-account proxy traffic actually egresses via the proxy.

This is NOT part of the automated suite (it needs a real proxy and internet).
It reads credentials from the environment so nothing secret is committed:

    WB_TEST_PROXY_URL='http://user:pass@host:port' python tests/manual_proxy_check.py

It fetches an IP-echo endpoint twice — once direct, once through the proxy —
and prints both egress IPs. A differing proxy IP proves the traffic is tunneled
and that proxy auth works.

If WB_TEST_PROXY_URL is unset it falls back to assembling one from
WB_TEST_PROXY_HOST/PORT/USER/PASS (host:port:user:pass form is also accepted).
"""

import json
import os
import sys
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from wb_accounts import open_url

ECHO_URLS = [
    "https://api.ipify.org?format=json",
    "http://httpbin.org/ip",
]


def resolve_proxy():
    url = os.environ.get("WB_TEST_PROXY_URL")
    if url:
        return url
    host = os.environ.get("WB_TEST_PROXY_HOST")
    port = os.environ.get("WB_TEST_PROXY_PORT")
    user = os.environ.get("WB_TEST_PROXY_USER")
    pw = os.environ.get("WB_TEST_PROXY_PASS")
    if host and port:
        auth = ""
        if user:
            auth = "%s:%s@" % (user, pw or "")
        return "http://%s%s:%s" % (auth, host, port)
    # Accept the "host:port:user:pass" shorthand too.
    raw = os.environ.get("WB_TEST_PROXY")
    if raw:
        parts = raw.split(":")
        if len(parts) == 4:
            return "http://%s:%s@%s:%s" % (parts[2], parts[3], parts[0], parts[1])
        return raw
    return None


def egress_ip(proxy=None):
    """Return (ip_or_error, endpoint_used)."""
    last = None
    for url in ECHO_URLS:
        req = urllib.request.Request(url, headers={"User-Agent": "curl/8"})
        try:
            with open_url(req, timeout=20, proxy=proxy) as resp:
                body = resp.read().decode("utf-8", "replace")
            try:
                return json.loads(body).get("ip") or body.strip(), url
            except Exception:
                return body.strip(), url
        except Exception as exc:
            last = "%s: %s" % (type(exc).__name__, exc)
    return last, None


def main():
    proxy = resolve_proxy()
    print("proxy configured:", bool(proxy))
    direct, durl = egress_ip(None)
    print("direct  [%s]: %s" % (durl, direct))
    if not proxy:
        print("no proxy URL set (WB_TEST_PROXY_URL) - skipping proxy leg")
        return 1
    proxied, purl = egress_ip(proxy)
    print("proxied [%s]: %s" % (purl, proxied))
    if purl and direct and proxied != direct and ":" not in str(proxied):
        print("RESULT: PASS - proxy egress IP differs from direct")
        return 0
    print("RESULT: FAIL - proxy leg did not produce a distinct egress IP")
    return 2


if __name__ == "__main__":
    sys.exit(main())
