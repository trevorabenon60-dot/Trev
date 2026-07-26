from dataclasses import dataclass

import pandas as pd

from indicators.liquidity import SwingPoint

BULLISH = "bullish"
BEARISH = "bearish"


@dataclass
class StructureEvent:
    index: int
    time: pd.Timestamp
    kind: str          # "BOS" (continuation) ou "CHoCH" (retournement)
    direction: str      # "bullish" ou "bearish"
    level: float


def analyze_structure(df: pd.DataFrame, swings: list[SwingPoint]) -> tuple[str | None, list[StructureEvent]]:
    """Parcourt les swings dans l'ordre chronologique et détecte les BOS/CHoCH
    en comparant chaque clôture de bougie au dernier swing pertinent.

    Retourne le biais courant ("bullish"/"bearish") et la liste des événements.
    """
    ordered_swings = sorted(swings, key=lambda s: s.index)
    events: list[StructureEvent] = []
    bias: str | None = None
    last_swing_high: SwingPoint | None = None
    last_swing_low: SwingPoint | None = None
    swing_cursor = 0

    for i in range(len(df)):
        while swing_cursor < len(ordered_swings) and ordered_swings[swing_cursor].index <= i:
            s = ordered_swings[swing_cursor]
            if s.kind == "high":
                last_swing_high = s
            else:
                last_swing_low = s
            swing_cursor += 1

        close = df["close"].iloc[i]

        if last_swing_high is not None and close > last_swing_high.price:
            kind = "BOS" if bias == BULLISH else "CHoCH"
            events.append(StructureEvent(index=i, time=df["time"].iloc[i], kind=kind,
                                          direction=BULLISH, level=last_swing_high.price))
            bias = BULLISH
            last_swing_high = None  # évite de re-déclencher sur le même niveau

        elif last_swing_low is not None and close < last_swing_low.price:
            kind = "BOS" if bias == BEARISH else "CHoCH"
            events.append(StructureEvent(index=i, time=df["time"].iloc[i], kind=kind,
                                          direction=BEARISH, level=last_swing_low.price))
            bias = BEARISH
            last_swing_low = None

    return bias, events
