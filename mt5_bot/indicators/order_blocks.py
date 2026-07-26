from dataclasses import dataclass

import pandas as pd

from indicators.fvg import FVG


@dataclass
class OrderBlock:
    index: int
    time: pd.Timestamp
    direction: str  # "bullish" ou "bearish"
    top: float
    bottom: float
    mitigated: bool = False


def find_order_block_for_fvg(df: pd.DataFrame, fvg: FVG, max_lookback: int = 10) -> OrderBlock | None:
    """L'order block est la dernière bougie de couleur opposée juste avant
    le mouvement impulsif qui a créé la FVG (bougie c1 de la séquence à 3)."""
    c1_index = fvg.index - 1
    if c1_index < 0:
        return None

    search_from = max(0, c1_index - max_lookback)
    for i in range(c1_index, search_from - 1, -1):
        candle = df.iloc[i]
        is_bearish = candle["close"] < candle["open"]
        is_bullish = candle["close"] > candle["open"]

        if fvg.direction == "bullish" and is_bearish:
            return OrderBlock(index=i, time=candle["time"], direction="bullish",
                               top=candle["high"], bottom=candle["low"])
        if fvg.direction == "bearish" and is_bullish:
            return OrderBlock(index=i, time=candle["time"], direction="bearish",
                               top=candle["high"], bottom=candle["low"])

    return None


def mark_mitigated(df: pd.DataFrame, order_block: OrderBlock) -> None:
    for j in range(order_block.index + 1, len(df)):
        candle = df.iloc[j]
        if order_block.direction == "bullish" and candle["low"] <= order_block.top:
            order_block.mitigated = True
            return
        if order_block.direction == "bearish" and candle["high"] >= order_block.bottom:
            order_block.mitigated = True
            return
