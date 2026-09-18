usage.jsonl is created here at runtime.

usage-summary.json is a leftover from older builds, which rewrote it on every
request even though nothing ever read it back. New versions append to
usage.jsonl only; you can delete the old summary file safely.
