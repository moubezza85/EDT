"""
backend/routes/generate_routes.py
Routes asynchrones pour la génération d'emploi du temps via main.py (argparse).
"""
import json, os, sys, uuid, threading, subprocess, tempfile
from flask import Blueprint, jsonify, request, g

_BASE       = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR    = os.path.join(_BASE, "data")
SCRIPTS_DIR = os.path.join(_BASE, "scripts")

generate_bp = Blueprint("generate_ext", __name__)

_jobs: dict = {}
_lock = threading.Lock()


def _is_admin() -> bool:
    return str((g.user or {}).get("role", "")).strip().lower() == "admin"

def _forbidden():
    return jsonify({"ok": False, "code": "FORBIDDEN", "message": "Réservé à l'admin"}), 403

def _load(fname: str):
    with open(os.path.join(DATA_DIR, fname), "r", encoding="utf-8") as f:
        return json.load(f)

def _save(fname: str, data):
    path = os.path.join(DATA_DIR, fname)
    fd, tmp = tempfile.mkstemp(dir=DATA_DIR, prefix=fname + ".", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(tmp, path)
    finally:
        try: os.remove(tmp)
        except FileNotFoundError: pass


# ── Settings endpoints ────────────────────────────────────────────────────────

@generate_bp.route("/api/config", methods=["PUT"])
def put_config():
    if not _is_admin(): return _forbidden()
    _save("config.json", request.get_json(force=True))
    return jsonify({"ok": True})

@generate_bp.route("/api/settings/hard", methods=["GET"])
def get_hard():
    if not _is_admin(): return _forbidden()
    return jsonify(_load("hard.json"))

@generate_bp.route("/api/settings/hard", methods=["PUT"])
def put_hard():
    if not _is_admin(): return _forbidden()
    _save("hard.json", request.get_json(force=True))
    return jsonify({"ok": True})

@generate_bp.route("/api/settings/soft", methods=["GET"])
def get_soft():
    if not _is_admin(): return _forbidden()
    return jsonify(_load("soft.json"))

@generate_bp.route("/api/settings/soft", methods=["PUT"])
def put_soft():
    if not _is_admin(): return _forbidden()
    _save("soft.json", request.get_json(force=True))
    return jsonify({"ok": True})


# ── Async job runner ──────────────────────────────────────────────────────────

def _run_job(job_id: str, cli_args: list):
    with _lock:
        _jobs[job_id] = {"status": "running", "logs": [], "result": None}

    script = os.path.join(SCRIPTS_DIR, "main.py")
    try:
        proc = subprocess.Popen(
            [sys.executable, script] + cli_args,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True, bufsize=1,
            encoding="utf-8",
            cwd=SCRIPTS_DIR,
        )
        for line in iter(proc.stdout.readline, ""):
            line = line.rstrip("\n")
            if line:
                with _lock:
                    _jobs[job_id]["logs"].append(line)
        proc.wait()

        if proc.returncode == 0:
            sol_path = os.path.join(SCRIPTS_DIR, "solution_finale.json")
            if os.path.exists(sol_path):
                with open(sol_path, "r", encoding="utf-8") as f:
                    sol = json.load(f)
                sessions = sol if isinstance(sol, list) else sol.get("sessions", sol.get("seances", []))
                tt_path = os.path.join(DATA_DIR, "timetable.json")
                if os.path.exists(tt_path):
                    with open(tt_path, "r", encoding="utf-8") as f:
                        current = json.load(f)
                    version = int(current.get("version", 1)) + 1
                else:
                    version = 1
                _save("timetable.json", {"version": version, "sessions": sessions})
                with _lock:
                    _jobs[job_id]["logs"].append(f"✓ timetable.json mis à jour (version {version})")
            with _lock:
                _jobs[job_id]["status"] = "done"
                _jobs[job_id]["result"] = {"ok": True}
        else:
            with _lock:
                _jobs[job_id]["status"] = "error"
                _jobs[job_id]["result"] = {"ok": False, "message": f"Exit code: {proc.returncode}"}
    except Exception as exc:
        with _lock:
            _jobs[job_id]["status"] = "error"
            _jobs[job_id]["logs"].append(str(exc))
            _jobs[job_id]["result"] = {"ok": False, "message": str(exc)}


@generate_bp.route("/api/generate/memetic", methods=["POST"])
def start_generation():
    if not _is_admin(): return _forbidden()
    with _lock:
        for j in _jobs.values():
            if j["status"] == "running":
                return jsonify({"ok": False, "message": "Une génération est déjà en cours."}), 409

    body   = request.get_json(force=True) or {}
    mode   = body.get("mode", "memetic")
    params = body.get("params", {})

    cli = []
    if mode == "hc":        cli.append("--hc")
    elif mode == "cp_only": cli.append("--cp-only")
    else:                   cli.append("--memetic")

    mapping = {
        "cp_time":            "--cp-time",
        "cp_workers":         "--cp-workers",
        "max_iterations":     "--max-iterations",
        "max_no_improvement": "--max-no-improvement",
        "population":         "--population",
        "generations":        "--generations",
        "hc_freq":            "--hc-freq",
        "hc_top":             "--hc-top",
        "hc_iter":            "--hc-iter",
        "patience":           "--patience",
        "perturb_threshold":  "--perturb-threshold",
    }
    for key, flag in mapping.items():
        if key in params:
            cli += [flag, str(params[key])]
    if params.get("quiet", False):
        cli.append("--quiet")

    job_id = str(uuid.uuid4())
    threading.Thread(target=_run_job, args=(job_id, cli), daemon=True).start()
    return jsonify({"ok": True, "job_id": job_id})


@generate_bp.route("/api/generate/status", methods=["GET"])
def get_running():
    if not _is_admin(): return _forbidden()
    with _lock:
        for jid, j in _jobs.items():
            if j["status"] == "running":
                return jsonify({"ok": True, "job_id": jid, "status": "running", "logs": list(j["logs"])})
    return jsonify({"ok": True, "job_id": None, "status": "idle", "logs": []})


@generate_bp.route("/api/generate/status/<job_id>", methods=["GET"])
def get_job(job_id: str):
    if not _is_admin(): return _forbidden()
    with _lock:
        job = _jobs.get(job_id)
    if not job:
        return jsonify({"ok": False, "message": "Job introuvable"}), 404
    return jsonify({"ok": True, "status": job["status"], "logs": list(job["logs"]), "result": job["result"]})
