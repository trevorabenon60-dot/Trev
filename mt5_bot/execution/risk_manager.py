from datetime import datetime, time as dtime

import MetaTrader5 as mt5

from core.logger import setup_logger

logger = setup_logger(__name__)


class RiskManager:
    def __init__(self, risk_cfg: dict, magic_number: int):
        self.risk_per_trade_pct = risk_cfg["risk_per_trade_pct"]
        self.daily_loss_limit_pct = risk_cfg["daily_loss_limit_pct"]
        self.max_concurrent_setups = risk_cfg["max_concurrent_setups"]
        self.split_ratios = risk_cfg["split_ratios"]
        self.magic_number = magic_number
        self._day_start_balance: float | None = None
        self._day_start_date = None

    def _refresh_day_anchor(self) -> None:
        today = datetime.now().date()
        if self._day_start_date != today:
            info = mt5.account_info()
            self._day_start_balance = info.balance
            self._day_start_date = today
            logger.info("Nouvelle journée de trading, solde de référence = %.2f", self._day_start_balance)

    def daily_pnl_pct(self) -> float:
        self._refresh_day_anchor()
        info = mt5.account_info()
        if self._day_start_balance in (None, 0):
            return 0.0
        return (info.equity - self._day_start_balance) / self._day_start_balance * 100

    def daily_loss_limit_hit(self) -> bool:
        pnl_pct = self.daily_pnl_pct()
        hit = pnl_pct <= -abs(self.daily_loss_limit_pct)
        if hit:
            logger.warning("Coupe-circuit journalier atteint (%.2f%%), plus de nouvelles positions aujourd'hui.", pnl_pct)
        return hit

    def open_setup_count(self) -> int:
        positions = mt5.positions_get()
        if positions is None:
            return 0
        ours = [p for p in positions if p.magic == self.magic_number]
        tickets_per_ratio = max(len(self.split_ratios), 1)
        return len(ours) // tickets_per_ratio if ours else 0

    def can_open_new_setup(self) -> bool:
        if self.daily_loss_limit_hit():
            return False
        if self.open_setup_count() >= self.max_concurrent_setups:
            logger.info("Nombre max d'idées de trade simultanées atteint (%d).", self.max_concurrent_setups)
            return False
        return True

    def compute_setup_lots(self, symbol: str, sl_distance_price: float) -> list[float]:
        info = mt5.account_info()
        symbol_info = mt5.symbol_info(symbol)
        if symbol_info is None:
            raise RuntimeError(f"symbol_info introuvable pour {symbol}")

        risk_amount = info.balance * self.risk_per_trade_pct / 100
        value_per_price_unit_per_lot = symbol_info.trade_tick_value / symbol_info.trade_tick_size
        total_lot = risk_amount / (sl_distance_price * value_per_price_unit_per_lot)

        lots = []
        for ratio in self.split_ratios:
            lot = total_lot * ratio
            lot = self._round_to_step(lot, symbol_info)
            lots.append(lot)

        logger.info(
            "Sizing %s: risque=%.2f (%.2f%%), lot total=%.3f, split=%s",
            symbol, risk_amount, self.risk_per_trade_pct, total_lot, lots,
        )
        return lots

    @staticmethod
    def _round_to_step(lot: float, symbol_info) -> float:
        step = symbol_info.volume_step
        lot = max(symbol_info.volume_min, min(symbol_info.volume_max, lot))
        steps = round(lot / step)
        return round(steps * step, 2)
