import os

import MetaTrader5 as mt5
from dotenv import load_dotenv

from core.logger import setup_logger

logger = setup_logger(__name__)


class MT5Connector:
    def __init__(self, terminal_path: str | None = None):
        load_dotenv()
        self.terminal_path = terminal_path or None
        self._connected = False

    def connect(self) -> None:
        login = os.getenv("MT5_LOGIN")
        password = os.getenv("MT5_PASSWORD")
        server = os.getenv("MT5_SERVER")

        if not login or not password or not server:
            raise RuntimeError(
                "MT5_LOGIN / MT5_PASSWORD / MT5_SERVER manquants. "
                "Copie .env.example en .env et renseigne tes identifiants."
            )

        init_kwargs = {}
        if self.terminal_path:
            init_kwargs["path"] = self.terminal_path

        if not mt5.initialize(**init_kwargs):
            raise RuntimeError(f"Échec initialize() MT5: {mt5.last_error()}")

        authorized = mt5.login(int(login), password=password, server=server)
        if not authorized:
            mt5.shutdown()
            raise RuntimeError(f"Échec login MT5 (login={login}, server={server}): {mt5.last_error()}")

        self._connected = True
        info = mt5.account_info()
        logger.info(
            "Connecté à MT5: compte=%s serveur=%s solde=%.2f devise=%s",
            info.login, info.server, info.balance, info.currency,
        )

    def disconnect(self) -> None:
        if self._connected:
            mt5.shutdown()
            self._connected = False
            logger.info("Déconnecté de MT5.")

    def ensure_symbol(self, symbol: str) -> None:
        info = mt5.symbol_info(symbol)
        if info is None:
            raise RuntimeError(f"Symbole introuvable chez le broker: {symbol}")
        if not info.visible:
            if not mt5.symbol_select(symbol, True):
                raise RuntimeError(f"Impossible d'activer le symbole {symbol} dans le Market Watch.")

    def account_info(self):
        return mt5.account_info()

    def symbol_info(self, symbol: str):
        return mt5.symbol_info(symbol)

    def symbol_info_tick(self, symbol: str):
        return mt5.symbol_info_tick(symbol)

    def __enter__(self):
        self.connect()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.disconnect()
