import MetaTrader5 as mt5

from core.logger import setup_logger
from strategy.setup import TradeSetup

logger = setup_logger(__name__)


class OrderManager:
    def __init__(self, execution_cfg: dict):
        self.magic_number = execution_cfg["magic_number"]
        self.slippage_points = execution_cfg["slippage_points"]
        self.comment = execution_cfg["order_comment"]

    def open_setup(self, setup: TradeSetup, lots: list[float]) -> list[int]:
        tick = mt5.symbol_info_tick(setup.symbol)
        if tick is None:
            raise RuntimeError(f"Pas de tick disponible pour {setup.symbol}")

        order_type = mt5.ORDER_TYPE_BUY if setup.direction == "buy" else mt5.ORDER_TYPE_SELL
        price = tick.ask if setup.direction == "buy" else tick.bid
        tp_targets = [setup.tp1_price, setup.tp2_price, 0.0]  # 3e ticket = runner, TP géré en trailing

        tickets: list[int] = []
        for lot, tp in zip(lots, tp_targets):
            if lot <= 0:
                continue
            request = {
                "action": mt5.TRADE_ACTION_DEAL,
                "symbol": setup.symbol,
                "volume": lot,
                "type": order_type,
                "price": price,
                "sl": setup.sl_price,
                "tp": tp,
                "deviation": self.slippage_points,
                "magic": self.magic_number,
                "comment": self.comment,
                "type_time": mt5.ORDER_TIME_GTC,
                "type_filling": mt5.ORDER_FILLING_IOC,
            }
            result = mt5.order_send(request)
            if result is None or result.retcode != mt5.TRADE_RETCODE_DONE:
                logger.error("Échec ordre %s %s lot=%.3f: %s", setup.symbol, setup.direction, lot, result)
                continue

            logger.info(
                "Ordre exécuté: %s %s lot=%.3f prix=%.2f SL=%.2f TP=%.2f ticket=%d",
                setup.symbol, setup.direction, lot, price, setup.sl_price, tp, result.order,
            )
            tickets.append(result.order)

        return tickets

    def modify_sl(self, position, new_sl: float) -> bool:
        request = {
            "action": mt5.TRADE_ACTION_SLTP,
            "symbol": position.symbol,
            "position": position.ticket,
            "sl": new_sl,
            "tp": position.tp,
        }
        result = mt5.order_send(request)
        ok = result is not None and result.retcode == mt5.TRADE_RETCODE_DONE
        if ok:
            logger.info("SL modifié pour ticket %d -> %.2f", position.ticket, new_sl)
        else:
            logger.error("Échec modification SL ticket %d: %s", position.ticket, result)
        return ok
