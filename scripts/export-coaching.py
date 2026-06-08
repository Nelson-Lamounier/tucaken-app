#!/usr/bin/env python3
"""Export RDS rows into a versioned, per-user tree in the repo.

Reads JSONL on stdin (one row object per line, each carrying at least `userId`
and `applicationId`) and writes:

    <BASE>/[<stage>/]<userId>/<applicationId>/vNNN.json   (new version)
    <BASE>/[<stage>/]<userId>/<applicationId>/latest.json (copy of newest)

The `<stage>` segment is included only when the STAGE env var is non-empty
(coaching is stage-scoped; research is not). Versioning is content-addressed: a
new vNNN.json is only created when the row's data differs from the latest stored
version (SHA-256 over the payload, excluding the volatile `exportedAt` field).
Re-running with no DB change is a no-op. Env: BASE (output root), STAGE (optional
path segment).
"""
from __future__ import annotations

import datetime
import hashlib
import json
import os
import re
import shutil
import sys

VERSION_RE = re.compile(r"^v(\d+)\.json$")


def version_number(name: str) -> int | None:
    m = VERSION_RE.match(name)
    return int(m.group(1)) if m else None


def latest_version_file(directory: str) -> str | None:
    versions = [f for f in os.listdir(directory) if version_number(f) is not None]
    if not versions:
        return None
    return max(versions, key=version_number)  # type: ignore[arg-type]


def content_hash(payload: dict) -> str:
    canonical = json.dumps(payload, sort_keys=True, ensure_ascii=False, default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def stored_hash(directory: str, version_file: str | None) -> str | None:
    if not version_file:
        return None
    try:
        with open(os.path.join(directory, version_file), encoding="utf-8") as fh:
            return json.load(fh).get("contentHash")
    except (json.JSONDecodeError, OSError):
        return None


def write_version(directory: str, version_file: str | None, row: dict, digest: str) -> str:
    next_n = (version_number(version_file) + 1) if version_file else 1  # type: ignore[operator]
    fname = f"v{next_n:03d}.json"
    doc = {
        "exportedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "contentHash": digest,
        **row,
    }
    out_path = os.path.join(directory, fname)
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, indent=2, ensure_ascii=False, default=str)
    shutil.copyfile(out_path, os.path.join(directory, "latest.json"))
    return fname


def export_row(row: dict, base: str, stage: str) -> bool:
    """Write a new version for `row` if changed. Returns True when written."""
    user = row.get("userId") or "unknown-user"
    app = row.get("applicationId") or "unknown-app"
    parts = [base] + ([stage] if stage else []) + [str(user), str(app)]
    directory = os.path.join(*parts)
    label = f"{stage + '/' if stage else ''}{user}/{app}"
    os.makedirs(directory, exist_ok=True)

    digest = content_hash(row)
    latest = latest_version_file(directory)
    if stored_hash(directory, latest) == digest:
        print(f"  = {label}: unchanged ({latest})")
        return False

    fname = write_version(directory, latest, row, digest)
    print(f"  + {label}/{fname}")
    return True


def main() -> int:
    base = os.environ.get("BASE")
    stage = os.environ.get("STAGE", "").strip()
    if not base:
        print("BASE env var is required", file=sys.stderr)
        return 1

    written = 0
    total = 0
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        total += 1
        if export_row(json.loads(line), base, stage):
            written += 1

    print(f"Done: {written} new version(s), {total - written} unchanged.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
