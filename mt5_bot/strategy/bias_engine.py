import pandas as pd

from indicators.liquidity import detect_swings
from indicators.structure import analyze_structure


def get_bias(df: pd.DataFrame, swing_lookback: int = 5) -> str | None:
    """Biais directionnel d'un timeframe donné, basé sur le dernier BOS/CHoCH."""
    swings = detect_swings(df, lookback=swing_lookback)
    bias, _events = analyze_structure(df, swings)
    return bias
