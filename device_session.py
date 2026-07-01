"""
DeviceSession — motor de automação Android via ADB puro + uiautomator dump.

Substitui o CyAndroCel (Cython, servidor uiautomator2, pandas) pela mesma
estratégia validada em produção no checker-bradesco-seguro.py:

    adb shell uiautomator dump  →  pull XML  →  ElementTree  →  bounds/tap

Sem compilação, sem servidor externo, sem dependências pesadas.
Uma instância é criada por device_id e reutilizada (ver device_registry.py).
"""

from __future__ import annotations

import base64
import math
import random
import re
import subprocess
import threading
import time
import xml.etree.ElementTree as ET
from typing import Optional

ADB = "adb"

WATCHDOG_TIMEOUT = 300  # segundos sem atividade → reinicia emulador (se suportado)


class DeviceSession:
    """
    Sessão estável para um único dispositivo/emulador.

    Thread-safe: todas as chamadas adb/dump_ui passam por um lock interno,
    serializando acessos concorrentes ao mesmo device (ex: API + flow rodando juntos).
    """

    def __init__(self, device_id: str, memuc_path: Optional[str] = None):
        self.device_id = device_id
        self.memuc_path = memuc_path  # ex: r"C:\Program Files\Microvirt\MEmu\memuc.exe"

        self._lock = threading.Lock()
        self._memu_index = self._detectar_indice_memu()

        self._heartbeat = time.time()
        self._watchdog_ativo = False
        self._watchdog_thread: Optional[threading.Thread] = None

        self.screen_width, self.screen_height = self._detectar_resolucao()

    # ── DETECÇÃO DE AMBIENTE ──────────────────────────────────────────

    def _detectar_indice_memu(self) -> Optional[int]:
        """Mapeia serial ADB (127.0.0.1:21523) → índice MEmu, se aplicável."""
        if not self.memuc_path or ":" not in self.device_id:
            return None
        try:
            porta = int(self.device_id.split(":")[1])
            idx = (porta - 21503) // 10
            return idx if idx >= 0 else None
        except Exception:
            return None

    def _detectar_resolucao(self) -> tuple[int, int]:
        saida = self.adb("shell wm size", timeout=10)
        m = re.search(r"(\d+)x(\d+)", saida)
        if m:
            return int(m.group(1)), int(m.group(2))
        return 1080, 2400  # fallback seguro

    # ── WATCHDOG ──────────────────────────────────────────────────────

    def toque(self) -> None:
        """Atualiza o heartbeat — chame em qualquer ação que prove que a sessão está viva."""
        self._heartbeat = time.time()

    def iniciar_watchdog(self, on_timeout=None) -> None:
        """
        Inicia thread de watchdog. Se ficar sem atividade por WATCHDOG_TIMEOUT
        segundos, chama on_timeout() (ou reinicia o emulador, se suportado).
        """
        self._watchdog_ativo = True
        self._heartbeat = time.time()

        def _loop():
            while self._watchdog_ativo:
                time.sleep(15)
                if not self._watchdog_ativo:
                    break
                inativo = time.time() - self._heartbeat
                if inativo >= WATCHDOG_TIMEOUT:
                    self.toque()  # reseta antes de agir, evita loop
                    if on_timeout:
                        on_timeout()
                    elif self._memu_index is not None:
                        self.reiniciar_emulador()
                    self.toque()

        self._watchdog_thread = threading.Thread(
            target=_loop, name=f"watchdog-{self.device_id}", daemon=True
        )
        self._watchdog_thread.start()

    def parar_watchdog(self) -> None:
        self._watchdog_ativo = False

    # ── REINÍCIO DO EMULADOR (apenas MEmu, se configurado) ────────────

    def suporta_reinicio(self) -> bool:
        return self._memu_index is not None

    def reiniciar_emulador(self) -> bool:
        if self._memu_index is None:
            return False
        try:
            subprocess.run(
                [self.memuc_path, "stop", "-i", str(self._memu_index)],
                timeout=30, capture_output=True,
            )
            time.sleep(5)
            subprocess.run(
                [self.memuc_path, "start", "-i", str(self._memu_index)],
                timeout=30, capture_output=True,
            )
        except Exception:
            return False

        inicio = time.time()
        while time.time() - inicio < 120:
            time.sleep(5)
            self.toque()
            saida = self.adb("shell getprop sys.boot_completed", timeout=15)
            if saida.strip() == "1":
                time.sleep(5)
                return True
        return False

    # ── ADB ─────────────────────────────────────────────────────────

    def adb(self, cmd: str, timeout: int = 30) -> str:
        try:
            result = subprocess.run(
                f"{ADB} -s {self.device_id} {cmd}",
                shell=True, capture_output=True, text=True, timeout=timeout,
            )
            return result.stdout
        except subprocess.TimeoutExpired:
            return ""

    # ── TAP HUMANO (gaussiano) ────────────────────────────────────────

    def _gaussiano(self, centro: int, desvio: int) -> int:
        while True:
            v = random.gauss(0, desvio)
            if abs(v) <= desvio * 2:
                return int(centro + v)

    def tap(self, cx: int, cy: int, desvio_x: int = 6, desvio_y: int = 5) -> None:
        x = self._gaussiano(cx, desvio_x)
        y = self._gaussiano(cy, desvio_y)
        hold = random.randint(65, 125)
        self.adb(f"shell input touchscreen swipe {x} {y} {x} {y} {hold}")
        time.sleep(random.uniform(0.08, 0.18))

    # ── DIGITAÇÃO HUMANA ──────────────────────────────────────────────

    def digitar(self, valor: str) -> None:
        especiais = set(" '\"\\()&|;<>`$!#~*?")
        if not any(c in especiais for c in valor):
            self.adb(f'shell input text "{valor}"')
            time.sleep(random.uniform(0.10, 0.25))
            return
        for char in valor:
            if char == " ":
                escaped = "%s"
            elif char in especiais:
                escaped = f"\\{char}"
            else:
                escaped = char
            self.adb(f'shell input text "{escaped}"')
            delay = random.uniform(0.070, 0.210)
            if random.random() < 0.08:
                delay += random.uniform(0.25, 0.65)
            time.sleep(delay)

    def limpar_campo(self) -> None:
        """Select-all + delete no campo focado."""
        self.adb("shell input keyevent KEYCODE_CTRL_A")
        time.sleep(0.08)
        self.adb("shell input keyevent KEYCODE_FORWARD_DEL")
        time.sleep(0.15)

    # ── KEYCODE ───────────────────────────────────────────────────────

    def keyevent(self, key: str, long_press: bool = False) -> None:
        if long_press:
            self.adb(f"shell input keyevent --longpress KEYCODE_{key.upper()}")
        else:
            self.adb(f"shell input keyevent KEYCODE_{key.upper()}")

    # ── SWIPE ─────────────────────────────────────────────────────────

    def swipe(self, x1: int, y1: int, x2: int, y2: int, duracao_ms: int = 300) -> None:
        dur = duracao_ms + random.randint(-30, 30)
        self.adb(f"shell input swipe {x1} {y1} {x2} {y2} {dur}")
        time.sleep(random.uniform(0.15, 0.35))

    def swipe_direcao(self, direction: str, distance_pct: float = 0.4, duracao_ms: int = 300) -> None:
        cx, cy = self.screen_width // 2, self.screen_height // 2
        dx = int(self.screen_width * distance_pct / 2)
        dy = int(self.screen_height * distance_pct / 2)
        coords = {
            "up":    (cx, cy + dy, cx, cy - dy),
            "down":  (cx, cy - dy, cx, cy + dy),
            "left":  (cx + dx, cy, cx - dx, cy),
            "right": (cx - dx, cy, cx + dx, cy),
        }
        key = direction.lower()
        if key not in coords:
            raise ValueError(f"Direção inválida: '{direction}'. Use: up, down, left, right.")
        self.swipe(*coords[key], duracao_ms=duracao_ms)

    # ── DELAY ─────────────────────────────────────────────────────────

    def esperar(self, base: float, variacao: float = 0.4) -> None:
        jitter = random.gauss(0, variacao * 0.35)
        duracao = base + random.uniform(-variacao, variacao) + jitter
        time.sleep(max(0.05, duracao))

    # ── APP ──────────────────────────────────────────────────────────

    def abrir_app(self, package: str, sleep_after: float = 3.0) -> None:
        self.adb(f"shell monkey -p {package} -c android.intent.category.LAUNCHER 1")
        time.sleep(sleep_after)

    def abrir_url(self, url: str) -> None:
        self.adb(f'shell am start -a android.intent.action.VIEW -d "{url}"')

    def fechar_app(self, package: str, limpar_dados: bool = False) -> None:
        self.adb(f"shell am force-stop {package}")
        self.esperar(1.0, 0.3)
        if limpar_dados:
            self.adb(f"shell pm clear {package}")
            self.esperar(0.5, 0.2)

    def app_atual(self) -> Optional[dict]:
        out = self.adb("shell dumpsys window windows", timeout=10)
        m = re.search(r"mCurrentFocus=Window\{[^}]+ ([^\s/]+)/([^\s}]+)", out)
        if not m:
            out2 = self.adb("shell dumpsys activity activities", timeout=10)
            m = re.search(r"mResumedActivity:.*?([a-z][a-z0-9_.]+)/([^\s}]+)", out2, re.IGNORECASE)
        if not m:
            return None
        return {"package": m.group(1), "activity": m.group(2)}

    # ── SCREENSHOT ───────────────────────────────────────────────────

    def screenshot_b64(self) -> Optional[str]:
        try:
            result = subprocess.run(
                f"{ADB} -s {self.device_id} exec-out screencap -p",
                shell=True, capture_output=True, timeout=15,
            )
            if result.returncode == 0 and result.stdout:
                return base64.b64encode(result.stdout).decode("ascii")
        except Exception:
            pass
        return None

    # ── UI DUMP (núcleo do motor) ──────────────────────────────────────

    def dump_ui(self, tentativas: int = 3) -> ET.Element:
        """
        Faz uiautomator dump + pull + parse XML.
        Em caso de falha total, tenta reiniciar o emulador (se suportado)
        antes de desistir — replica o comportamento validado no Bradesco.
        """
        dump_path = f"window_dump_{self.device_id.replace(':', '_')}.xml"

        with self._lock:
            for tentativa in range(1, tentativas + 1):
                try:
                    self.adb("shell uiautomator dump /sdcard/window_dump.xml", timeout=25)
                    self.adb(f"pull /sdcard/window_dump.xml {dump_path}", timeout=15)
                    import os
                    if not os.path.exists(dump_path) or os.path.getsize(dump_path) < 100:
                        raise OSError("XML vazio ou ausente")
                    root = ET.parse(dump_path).getroot()
                    if root is not None:
                        return root
                except (ET.ParseError, FileNotFoundError, OSError, subprocess.TimeoutExpired):
                    pass
                time.sleep(2.0 * tentativa)

            if self.suporta_reinicio():
                if self.reiniciar_emulador():
                    try:
                        self.adb("shell uiautomator dump /sdcard/window_dump.xml", timeout=25)
                        self.adb(f"pull /sdcard/window_dump.xml {dump_path}", timeout=15)
                        root = ET.parse(dump_path).getroot()
                        if root is not None:
                            return root
                    except Exception:
                        pass

            raise RuntimeError(f"dump_ui falhou — device '{self.device_id}' irresponsivo")

    # ── BOUNDS ──────────────────────────────────────────────────────

    @staticmethod
    def centro_bounds(bounds: str) -> tuple[int, int]:
        x1, y1, x2, y2 = map(int, re.findall(r"\d+", bounds))
        return (x1 + x2) // 2, (y1 + y2) // 2

    @staticmethod
    def area_bounds(bounds: str) -> int:
        x1, y1, x2, y2 = map(int, re.findall(r"\d+", bounds))
        return (x2 - x1) * (y2 - y1)

    @staticmethod
    def _desvio_por_bounds(bounds: str) -> tuple[int, int]:
        x1, y1, x2, y2 = map(int, re.findall(r"\d+", bounds))
        dx = max(4, min(20, int((x2 - x1) * 0.15)))
        dy = max(4, min(20, int((y2 - y1) * 0.15)))
        return dx, dy

    # ── ELEMENTOS ─────────────────────────────────────────────────────

    def get_elements(self) -> list[dict]:
        """
        Retorna todos os elementos da tela como lista de dicts —
        formato consumido pelo endpoint /api/device/inspect e pelo frontend.
        """
        root = self.dump_ui()
        elementos = []
        for node in root.iter("node"):
            bounds = node.attrib.get("bounds", "")
            if not bounds:
                continue
            try:
                x1, y1, x2, y2 = map(int, re.findall(r"\d+", bounds))
            except ValueError:
                continue
            elementos.append({
                "text":         node.attrib.get("text", ""),
                "resource_id":  node.attrib.get("resource-id", ""),
                "class_name":   node.attrib.get("class", ""),
                "content_desc": node.attrib.get("content-desc", ""),
                "clickable":    node.attrib.get("clickable") == "true",
                "enabled":      node.attrib.get("enabled") == "true",
                "scrollable":   node.attrib.get("scrollable") == "true",
                "bounds":       bounds,
                "start_x": x1, "start_y": y1, "end_x": x2, "end_y": y2,
                "center_x": (x1 + x2) // 2, "center_y": (y1 + y2) // 2,
                "width": x2 - x1, "height": y2 - y1,
            })
        return elementos

    def _match(self, valor: str, alvo: str, match: str) -> bool:
        if match == "exact":
            return valor == alvo
        if match == "contains":
            return alvo.lower() in valor.lower()
        if match == "regex":
            return re.search(alvo, valor) is not None
        raise ValueError(f"Estratégia de match inválida: '{match}'")

    def encontrar_elemento(
        self, valor: str, by: str = "text", match: str = "contains",
        index: int = 0, preferir_clickable: bool = True,
    ) -> Optional[dict]:
        """Busca elementos por texto/resource_id/content_desc/class_name."""
        campo = {
            "text": "text", "resource_id": "resource_id",
            "content_desc": "content_desc", "class_name": "class_name",
        }.get(by)
        if campo is None:
            raise ValueError(f"Campo de busca inválido: '{by}'")

        candidatos = [
            el for el in self.get_elements()
            if el[campo] and self._match(el[campo], valor, match)
        ]
        if not candidatos:
            return None
        if preferir_clickable:
            clicaveis = [c for c in candidatos if c["clickable"]]
            if clicaveis:
                candidatos = clicaveis
        candidatos.sort(key=lambda c: c["width"] * c["height"])
        if index >= len(candidatos):
            return None
        return candidatos[index]

    # ── AÇÕES DE ALTO NÍVEL ─────────────────────────────────────────

    def clicar_texto(
        self, texto: str, match: str = "contains", index: int = 0,
        retries: int = 1, retry_delay: float = 1.0, scroll: bool = False,
    ) -> bool:
        for tentativa in range(1, retries + 1):
            el = self.encontrar_elemento(texto, by="text", match=match, index=index)
            if el:
                self.tap(el["center_x"], el["center_y"])
                return True
            if scroll:
                self.swipe_direcao("up")
                self.esperar(1.5, 0.4)
            if tentativa < retries:
                time.sleep(retry_delay)
        return False

    def aguardar_texto(self, texto: str, timeout: int = 20, match: str = "contains") -> bool:
        inicio = time.time()
        while time.time() - inicio < timeout:
            if self.encontrar_elemento(texto, by="text", match=match):
                return True
            time.sleep(random.uniform(0.8, 1.4))
        return False

    def obter_textos_tela(self) -> str:
        return " ".join(
            el["text"] or el["content_desc"]
            for el in self.get_elements()
            if el["text"] or el["content_desc"]
        )

    def preencher_campo_por_indice(self, indice: int, valor: str, limpar: bool = True) -> bool:
        """Localiza o N-ésimo EditText da tela e digita nele."""
        edittexts = [
            el for el in self.get_elements()
            if el["class_name"] == "android.widget.EditText"
        ]
        if len(edittexts) <= indice:
            return False

        el = edittexts[indice]
        self.tap(el["center_x"], el["center_y"])
        self.esperar(0.9, 0.3)
        if limpar:
            self.limpar_campo()
        self.digitar(valor)
        self.esperar(0.9, 0.3)
        return True
