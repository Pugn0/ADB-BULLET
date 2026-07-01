"""
ADB Bullet — API Bridge (FastAPI)

Serve de ponte entre a UI React e a NoCodeEngine (motor ADB puro / uiautomator dump).

Endpoints:
    GET    /api/devices              — lista dispositivos ADB conectados
    POST   /api/device/mirror        — abre scrcpy em background
    DELETE /api/device/mirror        — mata o processo scrcpy ativo
    POST   /api/device/inspect       — captura tela + hierarquia de UI
    GET    /api/device/current_app   — package/activity em foco
    POST   /api/flow/run             — executa um fluxo JSON na NoCodeEngine
    GET    /api/health

Requisitos:
    pip install fastapi uvicorn[standard]
"""

from __future__ import annotations

import logging
import re
import shutil
import subprocess
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from device_registry import DeviceRegistry
from engine import NoCodeEngine

log = logging.getLogger(__name__)

registry = DeviceRegistry()

# Processo scrcpy por device_id (um por device)
_mirror_procs: dict[str, subprocess.Popen] = {}


# ---------------------------------------------------------------------------
# Lifespan — startup / shutdown
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("ADB Bullet API iniciando...")
    yield
    for proc in _mirror_procs.values():
        try:
            proc.terminate()
        except Exception:
            pass
    registry.release_all()
    log.info("ADB Bullet API encerrada.")


app = FastAPI(title="ADB Bullet API", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],        # em produção, restringir para localhost:5173
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Modelos Pydantic
# ---------------------------------------------------------------------------
class MirrorRequest(BaseModel):
    device_id: str
    scrcpy_path: str = "scrcpy"
    max_size: int = 1024
    bit_rate: str = "4M"


class InspectRequest(BaseModel):
    device_id: str
    with_screenshot: bool = True


class FlowRunRequest(BaseModel):
    device_id: str
    flow: list[dict]
    initial_variables: dict = {}
    stop_on_error: bool = True


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/api/devices")
async def list_devices():
    """Retorna todos os dispositivos ADB conectados."""
    try:
        result = subprocess.run(
            "adb devices -l", shell=True, capture_output=True, text=True, timeout=10,
        )
        if result.returncode != 0 and not result.stdout:
            raise RuntimeError(f"adb retornou erro (código {result.returncode}): {result.stderr.strip()}")

        devices = []
        for line in result.stdout.splitlines():
            line = line.strip()
            if not line or line.startswith("List of devices") or line.startswith("*"):
                continue
            parts = line.split()
            if len(parts) < 2:
                continue
            device_id, state = parts[0], parts[1]
            model = next(
                (p.replace("model:", "").replace("_", " ") for p in parts if p.startswith("model:")),
                None,
            )
            devices.append({"id": device_id, "state": state, "model": model})

        return {"devices": devices}

    except Exception as exc:
        log.exception("Erro em /api/devices")
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/device/mirror")
async def start_mirror(req: MirrorRequest):
    """Abre o scrcpy em segundo plano para espelhamento do dispositivo."""
    device_id = req.device_id

    existing = _mirror_procs.get(device_id)
    if existing and existing.poll() is None:
        return {"status": "already_running", "device_id": device_id}

    scrcpy_resolved = shutil.which(req.scrcpy_path) or req.scrcpy_path
    if not os.path.isfile(scrcpy_resolved) and shutil.which(scrcpy_resolved) is None:
        raise HTTPException(
            status_code=404,
            detail=f"scrcpy não encontrado em '{scrcpy_resolved}'. Instale-o ou informe o caminho correto.",
        )

    cmd_str = (
        f'"{scrcpy_resolved}"'
        f' --serial "{device_id}"'
        f' --window-title "Framework Inspector"'
        f' --always-on-top'
        f' --max-size {req.max_size}'
        f' --video-bit-rate {req.bit_rate}'
        f' --no-audio'
        f' --turn-screen-off'
    )

    extra_flags = (
        subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS
        if os.name == "nt" else 0
    )

    proc = subprocess.Popen(
        cmd_str, shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        creationflags=extra_flags,
    )
    _mirror_procs[device_id] = proc
    log.info("scrcpy PID %d iniciado para device '%s'.", proc.pid, device_id)
    return {"status": "started", "device_id": device_id, "pid": proc.pid}


@app.delete("/api/device/mirror")
async def stop_mirror(device_id: str):
    """Para o processo scrcpy de um dispositivo."""
    proc = _mirror_procs.pop(device_id, None)
    if proc is None or proc.poll() is not None:
        return {"status": "not_running", "device_id": device_id}
    proc.terminate()
    return {"status": "stopped", "device_id": device_id}


@app.post("/api/device/inspect")
async def inspect_device(req: InspectRequest):
    """
    Captura a tela e a hierarquia de UI do dispositivo via uiautomator dump.
    Backend único — sem seleção, sem dependências externas (Tesseract, parsers C++).
    """
    try:
        session = registry.get(req.device_id)
        elements = session.get_elements()
        screenshot_b64 = session.screenshot_b64() if req.with_screenshot else None

        return {
            "screenshot_b64": screenshot_b64,
            "screen_width":   session.screen_width,
            "screen_height":  session.screen_height,
            "elements":       elements,
            "element_count":  len(elements),
        }

    except Exception as exc:
        log.exception("Erro em /api/device/inspect")
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/api/device/current_app")
async def current_app(device_id: str):
    """Retorna o package name e activity do app em foco no dispositivo."""
    try:
        session = registry.get(device_id)
        info = session.app_atual()
        if info is None:
            raise HTTPException(status_code=404, detail="Nenhum app em foco detectado.")
        return {**info, "full": f"{info['package']}/{info['activity']}"}
    except HTTPException:
        raise
    except Exception as exc:
        log.exception("Erro em /api/device/current_app")
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/flow/run")
async def run_flow(req: FlowRunRequest):
    """
    Executa um fluxo JSON na NoCodeEngine.

    Corpo:
        device_id          : str
        flow               : list[dict]
        initial_variables  : dict — variáveis pré-carregadas (credenciais etc.)
        stop_on_error      : bool
    """
    try:
        session = registry.get(req.device_id)
        engine = NoCodeEngine(
            session,
            initial_variables=req.initial_variables,
            stop_on_error=req.stop_on_error,
        )
        result = engine.run(req.flow)
        return result
    except Exception as exc:
        log.exception("Erro em /api/flow/run")
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/api/health")
async def health():
    return {"status": "ok", "active_mirrors": list(_mirror_procs.keys())}


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    uvicorn.run("api:app", host="127.0.0.1", port=8000, reload=True)
