"""
NoCodeEngine — Interpretador de fluxos JSON sobre DeviceSession (ADB puro).

Cada bloco do fluxo é um dict com as chaves:
    id         : str   — identificador único (usado em logs)
    type       : str   — tipo do bloco (ex: "BLOCK_CLICK_TEXT")
    properties : dict  — parâmetros específicos do bloco

Contrato JSON idêntico à versão anterior (CyAndroCel) — apenas o motor
por baixo mudou. O frontend React não precisa de nenhuma alteração.
"""

from __future__ import annotations

import re
import time
import logging
from typing import Any

from device_session import DeviceSession

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_VAR_PATTERN = re.compile(r"<([^>]+)>")


def _resolve(value: Any, variables: dict) -> Any:
    """Substitui <nome_variavel> pelo valor real em strings."""
    if not isinstance(value, str):
        return value
    return _VAR_PATTERN.sub(
        lambda m: str(variables.get(m.group(1), m.group(0))),
        value,
    )


# ---------------------------------------------------------------------------
# Handlers de blocos
# ---------------------------------------------------------------------------

class _BlockHandlers:
    """Cada método público aqui é um handler: handler(props, engine) → None."""

    # ------------------------------------------------------------------
    @staticmethod
    def BLOCK_LAUNCH_APP(props: dict, engine: "NoCodeEngine") -> None:
        """
        Abre um aplicativo pelo package name.

        Obrigatórias: package
        Opcionais: sleep_after (default 3)
        """
        package = _resolve(props["package"], engine.variables)
        sleep_after = float(props.get("sleep_after", 3))
        engine.session.abrir_app(package, sleep_after=sleep_after)
        log.info("BLOCK_LAUNCH_APP: '%s' aberto.", package)

    # ------------------------------------------------------------------
    @staticmethod
    def BLOCK_OPEN_URL(props: dict, engine: "NoCodeEngine") -> None:
        """
        Abre uma URL no navegador padrão.

        Obrigatórias: url
        Opcionais: sleep_after (default 2), wait_for_text, wait_timeout (default 20)
        """
        url = _resolve(props["url"], engine.variables)
        sleep_after = float(props.get("sleep_after", 2))
        engine.session.abrir_url(url)
        time.sleep(sleep_after)

        wait_for = props.get("wait_for_text")
        if wait_for:
            timeout = int(props.get("wait_timeout", 20))
            achou = engine.session.aguardar_texto(_resolve(wait_for, engine.variables), timeout=timeout)
            if not achou:
                raise RuntimeError(f"BLOCK_OPEN_URL: '{wait_for}' não apareceu em {timeout}s.")
        log.info("BLOCK_OPEN_URL: '%s' aberta.", url)

    # ------------------------------------------------------------------
    @staticmethod
    def BLOCK_CLOSE_APP(props: dict, engine: "NoCodeEngine") -> None:
        """
        Fecha (force-stop) um app, opcionalmente limpando dados/cache.

        Obrigatórias: package
        Opcionais: clear_data (default False)
        """
        package = _resolve(props["package"], engine.variables)
        clear_data = bool(props.get("clear_data", False))
        engine.session.fechar_app(package, limpar_dados=clear_data)
        log.info("BLOCK_CLOSE_APP: '%s' fechado (clear_data=%s).", package, clear_data)

    # ------------------------------------------------------------------
    @staticmethod
    def BLOCK_CLICK_TEXT(props: dict, engine: "NoCodeEngine") -> None:
        """
        Localiza um texto na tela e clica nele.

        Obrigatórias: text
        Opcionais: match ("contains" default | "exact" | "regex"), index (default 0),
                   retries (default 1), retry_delay (default 1.0), scroll (default False)
        """
        text = _resolve(props["text"], engine.variables)
        match = props.get("match", "contains")
        idx = int(props.get("index", 0))
        retries = int(props.get("retries", 1))
        retry_delay = float(props.get("retry_delay", 1.0))
        scroll = bool(props.get("scroll", False))

        ok = engine.session.clicar_texto(
            text, match=match, index=idx, retries=retries,
            retry_delay=retry_delay, scroll=scroll,
        )
        if not ok:
            raise RuntimeError(f"BLOCK_CLICK_TEXT: texto '{text}' não encontrado após {retries} tentativa(s).")
        log.info("BLOCK_CLICK_TEXT: clicou em '%s'.", text)

    # ------------------------------------------------------------------
    @staticmethod
    def BLOCK_INPUT_TEXT(props: dict, engine: "NoCodeEngine") -> None:
        """
        Toca no campo (se tap_x/tap_y fornecidos) e digita texto.

        Obrigatórias: text
        Opcionais: tap_x, tap_y, clear_first (default False)
        """
        text = _resolve(props["text"], engine.variables)
        clear_first = str(props.get("clear_first", "false")).lower() == "true"

        tap_x = int(props.get("tap_x", 0) or 0)
        tap_y = int(props.get("tap_y", 0) or 0)
        if tap_x and tap_y:
            engine.session.tap(tap_x, tap_y)
            time.sleep(0.3)

        if clear_first:
            engine.session.limpar_campo()
        engine.session.digitar(text)
        log.info("BLOCK_INPUT_TEXT: digitou '%s' em (%s,%s).", text, tap_x, tap_y)

    # ------------------------------------------------------------------
    @staticmethod
    def BLOCK_FILL_FIELD(props: dict, engine: "NoCodeEngine") -> None:
        """
        Localiza o N-ésimo EditText da tela, clica e digita.

        Obrigatórias: index (posição do campo, 0-based), text
        Opcionais: clear (default True)
        """
        idx = int(props["index"])
        text = _resolve(props["text"], engine.variables)
        clear = bool(props.get("clear", True))

        ok = engine.session.preencher_campo_por_indice(idx, text, limpar=clear)
        if not ok:
            raise RuntimeError(f"BLOCK_FILL_FIELD: campo de índice {idx} não encontrado.")
        log.info("BLOCK_FILL_FIELD: campo[%d] = '%s'.", idx, text)

    # ------------------------------------------------------------------
    @staticmethod
    def BLOCK_SWIPE(props: dict, engine: "NoCodeEngine") -> None:
        """
        Executa um gesto de swipe.

        Modo coordenadas: x1, y1, x2, y2, duration (default 300)
        Modo direção: direction ("up"|"down"|"left"|"right"), distance_pct (default 0.4), duration (default 300)
        """
        duration = int(props.get("duration", 300))

        if "direction" in props:
            direction = _resolve(props["direction"], engine.variables)
            distance_pct = float(props.get("distance_pct", 0.4))
            engine.session.swipe_direcao(direction, distance_pct=distance_pct, duracao_ms=duration)
            log.info("BLOCK_SWIPE: direção '%s'.", direction)
        else:
            x1 = int(_resolve(props["x1"], engine.variables))
            y1 = int(_resolve(props["y1"], engine.variables))
            x2 = int(_resolve(props["x2"], engine.variables))
            y2 = int(_resolve(props["y2"], engine.variables))
            engine.session.swipe(x1, y1, x2, y2, duracao_ms=duration)
            log.info("BLOCK_SWIPE: (%d,%d) → (%d,%d).", x1, y1, x2, y2)

    # ------------------------------------------------------------------
    @staticmethod
    def BLOCK_PARSE_ELEMENT(props: dict, engine: "NoCodeEngine") -> None:
        """
        Captura o texto/atributo de um elemento e salva numa variável.

        Obrigatórias: save_as
        Localização (uma obrigatória): text | resource_id | class_name | content_desc
        Opcionais: match (default "contains"), source_field (default "text"), index (default 0)
        """
        save_as = props["save_as"]
        match = props.get("match", "contains")
        source_field = props.get("source_field", "text")
        idx = int(props.get("index", 0))

        if "text" in props:
            by, valor = "text", _resolve(props["text"], engine.variables)
        elif "resource_id" in props:
            by, valor = "resource_id", _resolve(props["resource_id"], engine.variables)
        elif "class_name" in props:
            by, valor = "class_name", _resolve(props["class_name"], engine.variables)
        elif "content_desc" in props:
            by, valor = "content_desc", _resolve(props["content_desc"], engine.variables)
        else:
            raise ValueError("BLOCK_PARSE_ELEMENT: forneça 'text', 'resource_id', 'class_name' ou 'content_desc'.")

        el = engine.session.encontrar_elemento(valor, by=by, match=match, index=idx)
        if el is None:
            raise RuntimeError(f"BLOCK_PARSE_ELEMENT: elemento não encontrado para salvar em '{save_as}'.")

        engine.variables[save_as] = str(el.get(source_field, ""))
        log.info("BLOCK_PARSE_ELEMENT: variável '%s' = '%s'.", save_as, engine.variables[save_as])

    # ------------------------------------------------------------------
    @staticmethod
    def BLOCK_WAIT_TEXT(props: dict, engine: "NoCodeEngine") -> None:
        """
        Aguarda um texto aparecer na tela (polling).

        Obrigatórias: text
        Opcionais: timeout (default 20), match (default "contains")
        """
        text = _resolve(props["text"], engine.variables)
        timeout = int(props.get("timeout", 20))
        match = props.get("match", "contains")

        achou = engine.session.aguardar_texto(text, timeout=timeout, match=match)
        if not achou:
            raise RuntimeError(f"BLOCK_WAIT_TEXT: '{text}' não apareceu em {timeout}s.")
        log.info("BLOCK_WAIT_TEXT: '%s' encontrado.", text)

    # ------------------------------------------------------------------
    @staticmethod
    def BLOCK_WAIT(props: dict, engine: "NoCodeEngine") -> None:
        """Aguarda N segundos. Obrigatórias: seconds"""
        seconds = float(_resolve(props["seconds"], engine.variables))
        log.info("BLOCK_WAIT: aguardando %.2fs.", seconds)
        time.sleep(seconds)

    # ------------------------------------------------------------------
    @staticmethod
    def BLOCK_SET_VARIABLE(props: dict, engine: "NoCodeEngine") -> None:
        """Define/sobrescreve uma variável. Obrigatórias: name, value"""
        name = props["name"]
        value = _resolve(props["value"], engine.variables)
        engine.variables[name] = value
        log.info("BLOCK_SET_VARIABLE: '%s' = '%s'.", name, value)

    # ------------------------------------------------------------------
    @staticmethod
    def BLOCK_BACK(props: dict, engine: "NoCodeEngine") -> None:
        """Pressiona o botão Voltar do Android."""
        engine.session.keyevent("BACK")
        log.info("BLOCK_BACK: pressionou KEYCODE_BACK.")

    # ------------------------------------------------------------------
    @staticmethod
    def BLOCK_KEYCODE(props: dict, engine: "NoCodeEngine") -> None:
        """
        Pressiona uma tecla Android.

        Obrigatórias: key (ex: "BACK", "HOME", "ENTER", "TAB")
        Opcionais: long (default False)
        """
        key = _resolve(props["key"], engine.variables).upper()
        long_press = bool(props.get("long", False))
        engine.session.keyevent(key, long_press=long_press)
        log.info("BLOCK_KEYCODE: KEYCODE_%s (long=%s).", key, long_press)

    # ------------------------------------------------------------------
    @staticmethod
    def BLOCK_IF_TEXT(props: dict, engine: "NoCodeEngine") -> None:
        """
        Verifica se um texto está na tela e salva True/False numa variável
        (usado pelo runner de fluxo para decidir ramificações).

        Obrigatórias: text, save_as
        Opcionais: match (default "contains")
        """
        text = _resolve(props["text"], engine.variables)
        match = props.get("match", "contains")
        save_as = props["save_as"]

        presente = engine.session.encontrar_elemento(text, by="text", match=match) is not None
        engine.variables[save_as] = presente
        log.info("BLOCK_IF_TEXT: '%s' presente=%s → '%s'.", text, presente, save_as)


# ---------------------------------------------------------------------------
# Engine principal
# ---------------------------------------------------------------------------

class NoCodeEngine:
    """
    Interpreta e executa fluxos JSON como comandos DeviceSession.

    Parâmetros
    ----------
    session : DeviceSession
        Sessão ADB já conectada ao dispositivo.
    initial_variables : dict, optional
    stop_on_error : bool, optional
        Se True (default), interrompe o fluxo ao primeiro erro.
    """

    def __init__(
        self,
        session: DeviceSession,
        initial_variables: dict | None = None,
        stop_on_error: bool = True,
    ) -> None:
        self.session = session
        self.variables: dict = dict(initial_variables or {})
        self.stop_on_error = stop_on_error

        self._handlers: dict[str, Any] = {}
        self._register_native_handlers()

    def _register_native_handlers(self) -> None:
        for name in dir(_BlockHandlers):
            if name.startswith("BLOCK_"):
                self._handlers[name] = getattr(_BlockHandlers, name)

    def register_block(self, block_type: str, handler) -> None:
        """Registra um handler customizado para um tipo de bloco externo."""
        self._handlers[block_type] = handler
        log.info("Handler '%s' registrado.", block_type)

    # ------------------------------------------------------------------
    def run(self, flow: list[dict]) -> dict:
        """
        Executa uma lista de blocos em sequência.

        Retorna: { success, executed, failed, variables }
        """
        executed = 0
        failed = 0

        for block in flow:
            block_id = block.get("id", "?")
            block_type = block.get("type", "")
            props = block.get("properties", {})

            log.info("→ Bloco [%s] type='%s'", block_id, block_type)
            self.session.toque()

            handler = self._handlers.get(block_type)
            if handler is None:
                msg = f"Bloco '{block_type}' (id={block_id}) não possui handler registrado."
                log.error(msg)
                failed += 1
                if self.stop_on_error:
                    return self._result(False, executed, failed)
                continue

            try:
                handler(props, self)
                executed += 1
            except Exception as exc:
                failed += 1
                log.error("Erro no bloco [%s] '%s': %s", block_id, block_type, exc, exc_info=True)
                if self.stop_on_error:
                    return self._result(False, executed, failed)

        return self._result(failed == 0, executed, failed)

    def _result(self, success: bool, executed: int, failed: int) -> dict:
        return {
            "success": success,
            "executed": executed,
            "failed": failed,
            "variables": dict(self.variables),
        }

    def set_variable(self, name: str, value: Any) -> None:
        self.variables[name] = value

    def get_variable(self, name: str, default: Any = None) -> Any:
        return self.variables.get(name, default)

    def reset_variables(self) -> None:
        self.variables.clear()
