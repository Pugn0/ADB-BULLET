"""
DeviceRegistry — gerencia instâncias DeviceSession por device_id.

Sem Cython, sem servidor uiautomator2, sem chdir para diretórios sem espaço.
Uma única instância (ADB puro) é criada por dispositivo e reutilizada.
"""

from __future__ import annotations

import logging
import os
import threading

from device_session import DeviceSession

log = logging.getLogger(__name__)

# Caminho do memuc.exe — usado apenas se o device for um emulador MEmu
# (porta 21503 + índice*10). Ajuste ou deixe None para desativar reinício automático.
MEMUC_PATH = r"C:\Program Files\Microvirt\MEmu\memuc.exe"


class DeviceRegistry:
    """Thread-safe cache de instâncias DeviceSession indexadas por device_id."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._instances: dict[str, DeviceSession] = {}

    def get(self, device_id: str) -> DeviceSession:
        with self._lock:
            if device_id not in self._instances:
                self._instances[device_id] = self._create(device_id)
            return self._instances[device_id]

    def release(self, device_id: str) -> None:
        with self._lock:
            inst = self._instances.pop(device_id, None)
            if inst is not None:
                inst.parar_watchdog()
            log.info("Sessão liberada para '%s'.", device_id)

    def release_all(self) -> None:
        with self._lock:
            for did in list(self._instances):
                self.release(did)

    def _create(self, device_id: str) -> DeviceSession:
        memuc = MEMUC_PATH if os.path.isfile(MEMUC_PATH) else None
        session = DeviceSession(device_id, memuc_path=memuc)
        log.info(
            "DeviceSession criada para '%s' (%dx%d)%s.",
            device_id, session.screen_width, session.screen_height,
            " [reinício automático suportado]" if session.suporta_reinicio() else "",
        )
        return session
