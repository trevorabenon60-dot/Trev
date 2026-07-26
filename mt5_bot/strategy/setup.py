from dataclasses import dataclass, field

import pandas as pd


@dataclass
class TradeSetup:
    symbol: str
    direction: str          # "buy" ou "sell"
    entry_price: float
    sl_price: float
    tp1_price: float
    tp2_price: float
    tp3_trailing: bool
    time: pd.Timestamp
    reasons: list[str] = field(default_factory=list)

    @property
    def sl_distance(self) -> float:
        return abs(self.entry_price - self.sl_price)
