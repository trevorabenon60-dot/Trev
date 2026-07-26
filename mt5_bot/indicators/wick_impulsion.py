import pandas as pd

from indicators.atr import compute_atr

NORMAL = "normal"
BULLISH_IMPULSION = "bullish_impulsion"
BULLISH_STRONG_IMPULSION = "bullish_strong_impulsion"
BEARISH_IMPULSION = "bearish_impulsion"
BEARISH_STRONG_IMPULSION = "bearish_strong_impulsion"


def classify_wick_impulsion(
    df: pd.DataFrame,
    atr_period: int = 14,
    impulsion_ratio: float = 1.5,
    strong_impulsion_ratio: float = 2.5,
) -> pd.DataFrame:
    """Classe chaque bougie selon la taille de sa mèche rapportée à l'ATR.

    Une mèche basse dominante et large = rejet des vendeurs = impulsion haussière.
    Une mèche haute dominante et large = rejet des acheteurs = impulsion baissière.
    Seuils calibrables dans config.yaml (indicators.wick_impulsion).
    """
    out = df.copy()
    atr = compute_atr(out, atr_period)

    body_top = out[["open", "close"]].max(axis=1)
    body_bottom = out[["open", "close"]].min(axis=1)
    upper_wick = out["high"] - body_top
    lower_wick = body_bottom - out["low"]

    upper_ratio = upper_wick / atr
    lower_ratio = lower_wick / atr

    def classify(u, l):
        if pd.isna(u) or pd.isna(l):
            return NORMAL
        if l > u and l >= impulsion_ratio:
            return BULLISH_STRONG_IMPULSION if l >= strong_impulsion_ratio else BULLISH_IMPULSION
        if u > l and u >= impulsion_ratio:
            return BEARISH_STRONG_IMPULSION if u >= strong_impulsion_ratio else BEARISH_IMPULSION
        return NORMAL

    out["upper_wick_atr_ratio"] = upper_ratio
    out["lower_wick_atr_ratio"] = lower_ratio
    out["wick_signal"] = [classify(u, l) for u, l in zip(upper_ratio, lower_ratio)]
    return out
