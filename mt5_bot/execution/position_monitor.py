from collections import defaultdict

import MetaTrader5 as mt5

from core.logger import setup_logger
from execution.order_manager import OrderManager

logger = setup_logger(__name__)


class PositionMonitor:
    def __init__(self, order_manager: OrderManager, magic_number: int, instruments_cfg: dict):
        self.order_manager = order_manager
        self.magic_number = magic_number
        self.instruments_cfg = instruments_cfg

    def manage_positions(self) -> None:
        positions = mt5.positions_get()
        if not positions:
            return

        ours = [p for p in positions if p.magic == self.magic_number]
        by_symbol = defaultdict(list)
        for p in ours:
            by_symbol[p.symbol].append(p)

        for symbol, group in by_symbol.items():
            self._manage_group(symbol, group)

    def _manage_group(self, symbol: str, group: list) -> None:
        entry_price = group[0].price_open
        direction = 1 if group[0].type == mt5.ORDER_TYPE_BUY else -1

        # Moins de 3 tickets encore ouverts -> au moins un TP a été touché -> sécuriser le reste au BE
        if len(group) < 3:
            for pos in group:
                already_be = (direction == 1 and pos.sl >= entry_price) or (direction == -1 and pos.sl <= entry_price)
                if not already_be:
                    self.order_manager.modify_sl(pos, entry_price)

        # Plus qu'un seul ticket (le "runner" TP3) -> trailing stop
        if len(group) == 1:
            self._trail_runner(symbol, group[0], direction)

    def _trail_runner(self, symbol: str, position, direction: int) -> None:
        instrument_cfg = next(
            (cfg for cfg in self.instruments_cfg.values() if cfg["symbol"] == symbol), None
        )
        if instrument_cfg is None or not instrument_cfg.get("tp3_trailing"):
            return

        tick = mt5.symbol_info_tick(symbol)
        if tick is None:
            return

        current_price = tick.bid if direction == 1 else tick.ask
        trail_distance = instrument_cfg["tp2_pips"] * instrument_cfg["pip_size"]
        candidate_sl = current_price - direction * trail_distance

        improves = (direction == 1 and candidate_sl > position.sl) or (direction == -1 and candidate_sl < position.sl)
        if improves:
            self.order_manager.modify_sl(position, candidate_sl)
