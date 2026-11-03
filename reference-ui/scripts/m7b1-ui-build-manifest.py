#!/usr/bin/env python3
"""INERT until Root invokes it after a reviewed successful live build. No runtime/DB/deployment work."""
import argparse, hashlib, json, os, pathlib, shutil, stat, subprocess

PRODUCT = "8dca4943bbe5b5ea4993a7eecb0e7a40fecb53c1"
parser = argparse.ArgumentParser()
parser.add_argument("--checkout", required=True)
parser.add_argument("--build-receipt", required=True)
parser.add_argument("--stage", required=True)
parser.add_argument("--manifest", required=True)
args = parser.parse_args()
if os.environ.get("M7B1_REVIEWED_STAGE") != "1":
    raise SystemExit("Root reviewed staging admission is required")
checkout = pathlib.Path(args.checkout).resolve(strict=True)
receipt_file = pathlib.Path(args.build_receipt).resolve(strict=True)
stage = pathlib.Path(args.stage)
manifest_file = pathlib.Path(args.manifest)
if receipt_file.stat().st_mode & 0o777 != 0o600:
    raise SystemExit("Protected build receipt required")
receipt = json.loads(receipt_file.read_text())
if receipt.get("sourceCommit") != PRODUCT or receipt.get("exitCode") != 0 or receipt.get("liveMode") is not True:
    raise SystemExit("Actual successful pinned live-build receipt required")
if subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=checkout, text=True).strip() != PRODUCT:
    raise SystemExit("Product source pin mismatch")
if subprocess.check_output(["git", "status", "--porcelain", "--untracked-files=no"], cwd=checkout, text=True):
    raise SystemExit("Tracked source changed")
if not stage.is_absolute() or not manifest_file.is_absolute() or stage.exists() or manifest_file.exists():
    raise SystemExit("Fresh absolute staging destinations required")
private_root = pathlib.Path("/home/amizo/erp-backups").resolve()
for target in [stage, manifest_file]:
    if not target.parent.exists() or not target.parent.resolve().is_relative_to(private_root):
        raise SystemExit("Private backup package destinations only")
if manifest_file.parent.stat().st_mode & 0o777 != 0o700:
    raise SystemExit("Private manifest parent required")
output = checkout / ".verification-dist"
files = {}
for filename in sorted(output.rglob("*")):
    if filename.is_symlink():
        raise SystemExit("Symlink in public build output")
    if not filename.is_file():
        continue
    relative = filename.relative_to(output).as_posix()
    if any(part.startswith(".") for part in pathlib.Path(relative).parts) or filename.suffix not in {".html", ".js", ".css", ".svg", ".png", ".ico", ".json", ".woff", ".woff2", ".ttf"}:
        raise SystemExit("Unexpected public build artifact")
    payload = filename.read_bytes()
    files[relative] = {"sha256": hashlib.sha256(payload).hexdigest(), "size": len(payload)}
if "index.html" not in files or not any(name.endswith(".js") for name in files) or not any(name.endswith(".css") for name in files):
    raise SystemExit("Complete build output required")
stage.mkdir(mode=0o755)
# Explicitly chmod the root as well as descendants: umask077 caused the earlier M7A 500/rollback.
stage.chmod(0o755)
for relative, pin in files.items():
    target = stage / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    for directory in [target.parent, *target.parent.parents]:
        if directory == stage or directory.is_relative_to(stage):
            directory.chmod(0o755)
    shutil.copyfile(output / relative, target)
    target.chmod(0o644)
    if hashlib.sha256(target.read_bytes()).hexdigest() != pin["sha256"]:
        raise SystemExit("Staged artifact changed")
manifest = {"schemaVersion": 1, "uiSourceCommit": PRODUCT, "liveMode": True,
            "buildReceiptSha256": hashlib.sha256(receipt_file.read_bytes()).hexdigest(), "staticRoot": str(stage), "files": files}
with manifest_file.open("x") as stream:
    os.fchmod(stream.fileno(), 0o600)
    stream.write(json.dumps(manifest, indent=2) + "\n")
print("Prepared immutable UI manifest; no alias, runtime or database changed")
