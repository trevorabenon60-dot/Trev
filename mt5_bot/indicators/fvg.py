from dataclasses import dataclass

import pandas as pd

from indicators.atr import compute_atr


@dataclass
class FVG:
    index: int          # index de la bougie centrale (bougie 2 des 3)
    time: pd.Timestamp
    direction: str        # "bullish" ou "bearish"
    top: float
    bottom: float
    filled: bool = False
    filled_at_index: int | None = None


def detect_fvgs(df: pd.DataFrame, atr_period: int = 14, min_gap_atr_ratio: float = 0.1) -> list[FVG]:
    """Détecte les Fair Value Gaps / imbalances sur 3 bougies consécutives.

    Bullish FVG: low(bougie3) > high(bougie1) -> gap entre les deux, non comblé par bougie2.
    Bearish FVG: high(bougie3) < low(bougie1) -> gap symétrique.
    """
    atr = compute_atr(df, atr_period)
    fvgs: list[FVG] = []

    for i in range(2, len(df)):
        c1, c3 = df.iloc[i - 2], df.iloc[i]
        current_atr = atr.iloc[i]
        if pd.isna(current_atr):
            continue

        if c3["low"] > c1["high"]:
            gap = c3["low"] - c1["high"]
            if gap >= min_gap_atr_ratio * current_atr:
                fvgs.append(FVG(index=i - 1, time=df.iloc[i - 1]["time"], direction="bullish",
                                 top=c3["low"], bottom=c1["high"]))

        elif c3["high"] < c1["low"]:
            gap = c1["low"] - c3["high"]
            if gap >= min_gap_atr_ratio * current_atr:
                fvgs.append(FVG(index=i - 1, time=df.iloc[i - 1]["time"], direction="bearish",
                                 top=c1["low"], bottom=c3["high"]))

    _mark_filled(df, fvgs)
    return fvgs


def _mark_filled(df: pd.DataFrame, fvgs: list[FVG]) -> None:
    for fvg in fvgs:
        for j in range(fvg.index + 2, len(df)):
            candle = df.iloc[j]
            if fvg.direction == "bullish" and candle["low"] <= fvg.top:
                fvg.filled = True
                fvg.filled_at_index = j
                break
            if fvg.direction == "bearish" and candle["high"] >= fvg.bottom:
                fvg.filled = True
                fvg.filled_at_index = j
                break


def unfilled_fvgs(fvgs: list[FVG], direction: str | None = None) -> list[FVG]:
    result = [f for f in fvgs if not f.filled]
    if direction:
        result = [f for f in result if f.direction == direction]
    return result
