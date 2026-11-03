"""Pin the instance-wide UI language setting.

The dashboard keeps a per-browser override in localStorage. This setting is
the fallback when a browser has no override yet: a new origin, a different
port or hostname, or a fresh browser profile should still open in the
instance's chosen language instead of always falling back to Simplified.
"""
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_TMP = tempfile.mkdtemp(prefix="wb-ui-language-")
_ACCOUNTS = os.path.join(_TMP, "accounts")
os.makedirs(_ACCOUNTS, exist_ok=True)

import wb_settings as S

PASS = FAIL = 0


def check(label, cond, extra=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print("  [PASS] " + label)
    else:
        FAIL += 1
        print("  [FAIL] " + label + ("  " + str(extra) if extra else ""))


check("default is Vietnamese", S.ui_language(_ACCOUNTS) == "vi")
check("set returns the stored value", S.set_ui_language(_ACCOUNTS, "zh-Hant") == "zh-Hant")
check("read back Traditional Chinese", S.ui_language(_ACCOUNTS) == "zh-Hant")
check("set English", S.set_ui_language(_ACCOUNTS, "en") == "en")
check("read back English", S.ui_language(_ACCOUNTS) == "en")
check("back to Simplified", S.set_ui_language(_ACCOUNTS, "zh") == "zh")
check("read back Simplified", S.ui_language(_ACCOUNTS) == "zh")
check("set Vietnamese", S.set_ui_language(_ACCOUNTS, "vi") == "vi")
check("read back Vietnamese", S.ui_language(_ACCOUNTS) == "vi")
check("back to English", S.set_ui_language(_ACCOUNTS, "en") == "en")

for bad in ("", "zh-TW", "EN", None, True, 1):
    try:
        S.set_ui_language(_ACCOUNTS, bad)
    except ValueError:
        check("reject %r" % (bad,), True)
    else:
        check("reject %r" % (bad,), False, "no ValueError")

print("PASS=%d FAIL=%d" % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
