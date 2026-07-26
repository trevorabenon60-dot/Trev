from dataclasses import dataclass

import pandas as pd


@dataclass
class SwingPoint:
    index: int
    time: pd.Timestamp
    price: float
    kind: str  # "high" ou "low"


@dataclass
class LiquiditySweep:
    index: int
    time: pd.Timestamp
    swept_level: float
    direction: str  # "bullish" (sweep d'un low, retournement haussier) ou "bearish"


def detect_swings(df: pd.DataFrame, lookback: int = 5) -> list[SwingPoint]:
    swings: list[SwingPoint] = []
    n = len(df)
    for i in range(lookback, n - lookback):
        window_high = df["high"].iloc[i - lookback:i + lookback + 1]
        window_low = df["low"].iloc[i - lookback:i + lookback + 1]

        if df["high"].iloc[i] == window_high.max():
            swings.append(SwingPoint(index=i, time=df["time"].iloc[i], price=df["high"].iloc[i], kind="high"))
        if df["low"].iloc[i] == window_low.min():
            swings.append(SwingPoint(index=i, time=df["time"].iloc[i], price=df["low"].iloc[i], kind="low"))

    return swings


def detect_equal_levels(swings: list[SwingPoint], tolerance: float) -> list[SwingPoint]:
    """Regroupe les swings proches (liquidité "equal highs/lows") et ne garde
    que ceux qui appartiennent à un groupe d'au moins 2 -> zone de liquidité probable."""
    pooled = []
    for kind in ("high", "low"):
        points = sorted([s for s in swings if s.kind == kind], key=lambda s: s.price)
        i = 0
        while i < len(points):
            group = [points[i]]
            j = i + 1
            while j < len(points) and abs(points[j].price - group[0].price) <= tolerance:
                group.append(points[j])
                j += 1
            if len(group) >= 2:
                pooled.extend(group)
            i = j
    return pooled


def detect_liquidity_sweep(df: pd.DataFrame, swings: list[SwingPoint], lookahead: int = 1) -> list[LiquiditySweep]:
    """Une bougie qui dépasse (wick) un swing high/low précédent puis clôture
    de l'autre côté = prise de liquidité (stop hunt)."""
    sweeps: list[LiquiditySweep] = []
    highs = [s for s in swings if s.kind == "high"]
    lows = [s for s in swings if s.kind == "low"]

    for i in range(len(df)):
        candle = df.iloc[i]
        prior_highs = [s for s in highs if s.index < i]
        prior_lows = [s for s in lows if s.index < i]

        if prior_highs:
            last_high = max(prior_highs, key=lambda s: s.index)
            if candle["high"] > last_high.price and candle["close"] < last_high.price:
                sweeps.append(LiquiditySweep(index=i, time=candle["time"],
                                              swept_level=last_high.price, direction="bearish"))

        if prior_lows:
            last_low = max(prior_lows, key=lambda s: s.index)
            if candle["low"] < last_low.price and candle["close"] > last_low.price:
                sweeps.append(LiquiditySweep(index=i, time=candle["time"],
                                              swept_level=last_low.price, direction="bullish"))

    return sweeps
