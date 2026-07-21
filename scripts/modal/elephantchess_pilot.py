"""Scale-to-zero Modal runner for the frozen ElephantChess mining pilot.

The durable queue, fencing, checkpoints, and results stay in Railway Postgres.
Each Modal input runs exactly one scan shard or one audit candidate.
"""

from __future__ import annotations

import hashlib
import itertools
import json
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Iterable

import modal

APP_NAME = "mistboard-elephantchess-pilot"
DATABASE_SECRET = "mistboard-mining-production-db"
RELEASE_NAME = "pikafish-official-2026-01-02"
ENGINE_ID = "Pikafish 2026-01-02"
PROFILE_VERSION = "elephantchess-pilot-2026-07-v1-modal-linux-sse41"
MANIFEST_FILE_SHA256 = "ea3701043c4167e92539165d01be3fa603c9d6c15bc97b915f8a420c145559ef"
MANIFEST_CONTENT_SHA256 = "e7f520ef1b0d7e8374ffafc4b88d8d3e4862cf06cf27852beef9f32f030f66aa"
ENGINE_BINARY_SHA256 = "be780323c9d1bb03771d6a59f6ce8020970aaf97db245b9e1cebe3b9dcd792c9"
ENGINE_NETWORK_SHA256 = "c4026370d7516d9b0f668447f9ca1931241538bdc689cde6fec6a991ac4d5f77"

REMOTE_ROOT = Path("/opt/mistboard")
REMOTE_BINARY = Path("/opt/pikafish/pikafish-sse41-popcnt")
REMOTE_NETWORK = Path("/opt/pikafish/pikafish.nnue")

if modal.is_local():
    REPO_ROOT = Path(__file__).resolve().parents[2]
    DEFAULT_RELEASE_DIR = REPO_ROOT.parent / "tools" / RELEASE_NAME
    RELEASE_DIR = Path(os.environ.get("MISTBOARD_MODAL_PIKAFISH_DIR", DEFAULT_RELEASE_DIR))
    LOCAL_BINARY = RELEASE_DIR / "Linux" / "pikafish-sse41-popcnt"
    LOCAL_NETWORK = RELEASE_DIR / "pikafish.nnue"
else:
    REPO_ROOT = REMOTE_ROOT
    LOCAL_BINARY = REMOTE_BINARY
    LOCAL_NETWORK = REMOTE_NETWORK


def _require_pinned_file(path: Path, expected_sha256: str) -> None:
    if not path.is_file():
        raise RuntimeError(
            f"required artifact not found: {path}; set MISTBOARD_MODAL_PIKAFISH_DIR"
        )
    with path.open("rb") as artifact:
        actual = hashlib.file_digest(artifact, "sha256").hexdigest()
    if actual != expected_sha256:
        raise RuntimeError(
            f"artifact hash mismatch for {path.name}: expected {expected_sha256}, got {actual}"
        )


if modal.is_local():
    _require_pinned_file(LOCAL_BINARY, ENGINE_BINARY_SHA256)
    _require_pinned_file(LOCAL_NETWORK, ENGINE_NETWORK_SHA256)

SOURCE_IGNORES = [
    "**/.git/**",
    "**/node_modules/**",
    "**/dist/**",
    "**/.env",
    "**/.env.*",
    "**/*credentials*.json",
    "**/*service-account*.json",
    "web/public/**",
]

if modal.is_local():
    image = (
        modal.Image.from_registry("node:22-bookworm-slim", add_python="3.12")
        .apt_install("libatomic1")
        .add_local_file(
            REPO_ROOT / "package.json", str(REMOTE_ROOT / "package.json"), copy=True
        )
        .add_local_file(
            REPO_ROOT / "package-lock.json",
            str(REMOTE_ROOT / "package-lock.json"),
            copy=True,
        )
        .add_local_file(
            REPO_ROOT / "tsconfig.base.json",
            str(REMOTE_ROOT / "tsconfig.base.json"),
            copy=True,
        )
        .add_local_dir(
            REPO_ROOT / "apps", str(REMOTE_ROOT / "apps"), copy=True, ignore=SOURCE_IGNORES
        )
        .add_local_dir(
            REPO_ROOT / "packages",
            str(REMOTE_ROOT / "packages"),
            copy=True,
            ignore=SOURCE_IGNORES,
        )
        .add_local_dir(
            REPO_ROOT / "scripts" / "variant-lab",
            str(REMOTE_ROOT / "scripts" / "variant-lab"),
            copy=True,
            ignore=SOURCE_IGNORES,
        )
        .run_commands(f"cd {REMOTE_ROOT} && npm ci --ignore-scripts")
        .run_commands(
            f"cd {REMOTE_ROOT} && npm run build --workspace @mistboard/game",
            f"cd {REMOTE_ROOT} && npm run build --workspace @mistboard/board-render",
        )
        .add_local_file(LOCAL_BINARY, str(REMOTE_BINARY), copy=True)
        .add_local_file(LOCAL_NETWORK, str(REMOTE_NETWORK), copy=True)
        .run_commands(f"chmod 0555 {REMOTE_BINARY}")
    )
else:
    # Function metadata is hydrated by Modal before the module is imported in a
    # running container. Remote imports only need a placeholder Image object.
    image = modal.Image.debian_slim()

app = modal.App(APP_NAME)
verify_app = modal.App(f"{APP_NAME}-verify")
database_secret = modal.Secret.from_name(DATABASE_SECRET, required_keys=["DATABASE_URL"])
retry_policy = modal.Retries(
    max_retries=2,
    backoff_coefficient=2.0,
    initial_delay=30.0,
    max_delay=60.0,
)


def _run_command(command: list[str]) -> dict[str, Any]:
    process = subprocess.Popen(
        command,
        cwd=REMOTE_ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )
    last_json: dict[str, Any] | None = None
    assert process.stdout is not None
    for line in process.stdout:
        print(line, end="", flush=True)
        try:
            parsed = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            last_json = parsed
    exit_code = process.wait()
    if exit_code != 0:
        raise subprocess.CalledProcessError(exit_code, command)
    if last_json is None:
        raise RuntimeError("worker completed without a JSON result")
    return last_json


def _require_built_workspaces() -> None:
    required = [
        REMOTE_ROOT / "packages" / "game" / "dist" / "index.js",
        REMOTE_ROOT / "packages" / "board-render" / "dist" / "index.js",
    ]
    missing = [str(path) for path in required if not path.is_file()]
    if missing:
        raise RuntimeError(f"Modal image is missing built workspaces: {', '.join(missing)}")


def _write_manifest(manifest_text: str) -> str:
    descriptor, path = tempfile.mkstemp(prefix="elephantchess-pilot-", suffix=".json")
    with os.fdopen(descriptor, "w", encoding="utf-8") as manifest_file:
        manifest_file.write(manifest_text)
    return path


def _initialization_command(manifest_path: str, *, verify_only: bool) -> list[str]:
    command = [
        "npm",
        "run",
        "pilot:elephantchess-run:init",
        "--workspace",
        "@mistboard/server",
        "--",
        "--manifest",
        manifest_path,
        "--manifest-file-sha256",
        MANIFEST_FILE_SHA256,
        "--manifest-content-sha256",
        MANIFEST_CONTENT_SHA256,
        "--binary",
        str(REMOTE_BINARY),
        "--binary-sha256",
        ENGINE_BINARY_SHA256,
        "--net",
        str(REMOTE_NETWORK),
        "--net-sha256",
        ENGINE_NETWORK_SHA256,
        "--engine-id",
        ENGINE_ID,
        "--profile-version",
        PROFILE_VERSION,
    ]
    if verify_only:
        command.append("--verify-only")
    return command


@verify_app.function(image=image, cpu=1.0, memory=1024, timeout=600)
def verify_image(manifest_text: str) -> dict[str, Any]:
    _require_built_workspaces()
    manifest_path = _write_manifest(manifest_text)
    try:
        return _run_command(_initialization_command(manifest_path, verify_only=True))
    finally:
        Path(manifest_path).unlink(missing_ok=True)


@app.function(image=image, secrets=[database_secret], cpu=1.0, memory=1024, timeout=600)
def initialize_run(manifest_text: str) -> dict[str, Any]:
    _require_built_workspaces()
    manifest_path = _write_manifest(manifest_text)
    try:
        return _run_command(_initialization_command(manifest_path, verify_only=False))
    finally:
        Path(manifest_path).unlink(missing_ok=True)


@app.function(
    image=image,
    secrets=[database_secret],
    cpu=1.0,
    memory=1024,
    timeout=6 * 60 * 60,
    retries=retry_policy,
    max_containers=4,
    scaledown_window=60,
)
def scan_shard(run_id: str, task_index: int, lease_ms: int) -> dict[str, Any]:
    _require_built_workspaces()
    task_id = os.environ.get("MODAL_TASK_ID", "unknown")
    return _run_command(
        [
            "npm",
            "run",
            "pilot:elephantchess-worker",
            "--",
            "--run-id",
            run_id,
            "--worker-id",
            f"modal-scan-{task_index}-{task_id}",
            "--binary",
            str(REMOTE_BINARY),
            "--net",
            str(REMOTE_NETWORK),
            "--lease-ms",
            str(lease_ms),
            "--max-shards",
            "1",
        ]
    )


@app.function(
    image=image,
    secrets=[database_secret],
    cpu=1.0,
    memory=1024,
    timeout=6 * 60 * 60,
    retries=retry_policy,
    max_containers=4,
    scaledown_window=60,
)
def audit_candidate(run_id: str, task_index: int, lease_ms: int) -> dict[str, Any]:
    _require_built_workspaces()
    task_id = os.environ.get("MODAL_TASK_ID", "unknown")
    return _run_command(
        [
            "npm",
            "run",
            "pilot:elephantchess-audit",
            "--",
            "--run-id",
            run_id,
            "--worker-id",
            f"modal-audit-{task_index}-{task_id}",
            "--binary",
            str(REMOTE_BINARY),
            "--net",
            str(REMOTE_NETWORK),
            "--lease-ms",
            str(lease_ms),
            "--max-candidates",
            "1",
        ]
    )


@app.function(image=image, secrets=[database_secret], cpu=0.125, memory=256, timeout=300)
def mining_status(run_id: str) -> dict[str, Any]:
    return _run_command(
        ["npm", "run", "pilot:elephantchess-status", "--", "--run-id", run_id]
    )


def _read_manifest(path: str) -> str:
    selected = path or os.environ.get("MISTBOARD_MODAL_MANIFEST_PATH", "")
    if not selected:
        raise ValueError("pass --manifest or set MISTBOARD_MODAL_MANIFEST_PATH")
    manifest_path = Path(selected).expanduser().resolve()
    if not manifest_path.is_file():
        raise ValueError(f"manifest not found: {manifest_path}")
    return manifest_path.read_text(encoding="utf-8")


def _validate_task_count(tasks: int) -> None:
    if tasks < 1 or tasks > 1_000:
        raise ValueError("tasks must be between 1 and 1000")


def _print_map_summary(kind: str, results: Iterable[object]) -> None:
    completed = 0
    failures: list[str] = []
    for result in results:
        if isinstance(result, BaseException):
            failures.append(repr(result))
        else:
            completed += 1
    print(json.dumps({"kind": kind, "completedInputs": completed, "failures": failures}))
    if failures:
        raise RuntimeError(f"{len(failures)} Modal inputs failed; rerun after leases expire")


@verify_app.local_entrypoint()
def verify(manifest: str = "") -> None:
    print(json.dumps(verify_image.remote(_read_manifest(manifest))))


@app.local_entrypoint()
def initialize(manifest: str = "") -> None:
    print(json.dumps(initialize_run.remote(_read_manifest(manifest))))


@app.local_entrypoint()
def scan(run_id: str, tasks: int = 1, lease_ms: int = 1_800_000) -> None:
    _validate_task_count(tasks)
    results = scan_shard.map(
        itertools.repeat(run_id, tasks),
        range(tasks),
        itertools.repeat(lease_ms, tasks),
        return_exceptions=True,
    )
    _print_map_summary("elephantchess-modal-scan", results)


@app.local_entrypoint()
def audit(run_id: str, tasks: int = 1, lease_ms: int = 1_800_000) -> None:
    _validate_task_count(tasks)
    results = audit_candidate.map(
        itertools.repeat(run_id, tasks),
        range(tasks),
        itertools.repeat(lease_ms, tasks),
        return_exceptions=True,
    )
    _print_map_summary("elephantchess-modal-audit", results)


@app.local_entrypoint()
def status(run_id: str) -> None:
    print(json.dumps(mining_status.remote(run_id)))
