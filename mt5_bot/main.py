import time

import yaml

from core.data_feed import DataFeed
from core.logger import setup_logger
from core.mt5_connector import MT5Connector
from execution.order_manager import OrderManager
from execution.position_monitor import PositionMonitor
from execution.risk_manager import RiskManager
from strategy.confluence import generate_setup


def load_config(path: str = "config/config.yaml") -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def required_timeframes(instrument_cfg: dict) -> list[str]:
    tfs = [instrument_cfg["bias_timeframe"], instrument_cfg["entry_timeframe"]]
    tfs += instrument_cfg["structure_timeframes"]
    return list(dict.fromkeys(tfs))  # dédoublonne en gardant l'ordre


def run() -> None:
    config = load_config()
    logger = setup_logger("mt5_bot", config["logging"]["level"], config["logging"]["file"])

    connector = MT5Connector(config["mt5"].get("terminal_path") or None)
    data_feed = DataFeed()
    risk_manager = RiskManager(config["risk"], config["execution"]["magic_number"])
    order_manager = OrderManager(config["execution"])
    position_monitor = PositionMonitor(order_manager, config["execution"]["magic_number"], config["instruments"])

    with connector:
        for instrument_cfg in config["instruments"].values():
            connector.ensure_symbol(instrument_cfg["symbol"])

        logger.info("Bot démarré. Mode compte: %s. Ctrl+C pour arrêter.", config["account"]["mode"])

        while True:
            try:
                position_monitor.manage_positions()

                if risk_manager.can_open_new_setup():
                    for instrument_name, instrument_cfg in config["instruments"].items():
                        symbol = instrument_cfg["symbol"]
                        tfs = required_timeframes(instrument_cfg)
                        data = data_feed.get_multi_timeframe(symbol, tfs)

                        setup = generate_setup(symbol, data, instrument_cfg, config["indicators"])
                        if setup is None:
                            continue

                        logger.info("Setup détecté sur %s: %s | raisons: %s",
                                    symbol, setup.direction, " | ".join(setup.reasons))

                        lots = risk_manager.compute_setup_lots(symbol, setup.sl_distance)
                        order_manager.open_setup(setup, lots)

                        if not risk_manager.can_open_new_setup():
                            break

            except Exception:
                logger.exception("Erreur dans la boucle principale, on continue au prochain cycle.")

            time.sleep(config["execution"]["poll_interval_seconds"])


if __name__ == "__main__":
    run()
