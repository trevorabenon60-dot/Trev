import pandas as pd

from indicators.atr import compute_atr

# Portage fidèle de l'indicateur Pine Script "Trev — Bougies Impulsions":
# une bougie est une impulsion si son range complet (high-low) dépasse
# facteur x ATR(lenATR). La couleur/direction dépend juste de close vs open.
NORMAL = "normal"
BULLISH_IMPULSION = "bullish_impulsion"   # bougie bleue
BEARISH_IMPULSION = "bearish_impulsion"   # bougie violette


def classify_impulsion(df: pd.DataFrame, atr_period: int = 14, impulsion_ratio: float = 1.5) -> pd.DataFrame:
    out = df.copy()
    atr = compute_atr(out, atr_period)
    candle_range = out["high"] - out["low"]

    is_bullish = out["close"] > out["open"]
    is_bearish = out["close"] < out["open"]
    is_impulse = candle_range > impulsion_ratio * atr

    def classify(bull, bear, impulse):
        if pd.isna(impulse):
            return NORMAL
        if bull and impulse:
            return BULLISH_IMPULSION
        if bear and impulse:
            return BEARISH_IMPULSION
        return NORMAL

    out["range_atr_ratio"] = candle_range / atr
    out["impulsion_signal"] = [
        classify(bull, bear, impulse)
        for bull, bear, impulse in zip(is_bullish, is_bearish, is_impulse)
    ]
    return out
