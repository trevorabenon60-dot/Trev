import pandas as pd

from indicators.equilibrium import compute_equilibrium
from indicators.fvg import detect_fvgs, unfilled_fvgs
from indicators.liquidity import detect_liquidity_sweep, detect_swings
from indicators.impulsion import (
    BULLISH_IMPULSION,
    BEARISH_IMPULSION,
    classify_impulsion,
)
from strategy.bias_engine import get_bias
from strategy.setup import TradeSetup

RECENT_CANDLES_WINDOW = 5  # fenêtre récente pour chercher sweep / bougie d'impulsion


def generate_setup(
    symbol: str,
    data: dict[str, pd.DataFrame],
    instrument_cfg: dict,
    indicators_cfg: dict,
) -> TradeSetup | None:
    reasons: list[str] = []

    bias_tf = instrument_cfg["bias_timeframe"]
    structure_tfs = instrument_cfg["structure_timeframes"]
    entry_tf = instrument_cfg["entry_timeframe"]
    swing_lookback = indicators_cfg["liquidity"]["swing_lookback"]

    h4_bias = get_bias(data[bias_tf], swing_lookback)
    if h4_bias is None:
        return None
    reasons.append(f"biais {bias_tf} = {h4_bias}")

    for tf in structure_tfs:
        tf_bias = get_bias(data[tf], swing_lookback)
        if tf_bias != h4_bias:
            return None
        reasons.append(f"structure {tf} alignée ({tf_bias})")

    entry_df = data[entry_tf]
    atr_period = indicators_cfg["atr"]["period"]

    swings_entry = detect_swings(entry_df, lookback=swing_lookback)
    sweeps = detect_liquidity_sweep(entry_df, swings_entry)
    recent_sweeps = [s for s in sweeps if s.index >= len(entry_df) - RECENT_CANDLES_WINDOW]
    expected_sweep_dir = "bullish" if h4_bias == "bullish" else "bearish"
    if not any(s.direction == expected_sweep_dir for s in recent_sweeps):
        return None
    reasons.append(f"prise de liquidité {expected_sweep_dir} récente sur {entry_tf}")

    fvgs = detect_fvgs(entry_df, atr_period, indicators_cfg["fvg"]["min_gap_atr_ratio"])
    open_fvgs = unfilled_fvgs(fvgs, direction=h4_bias)
    recent_fvgs = [f for f in open_fvgs if f.index >= len(entry_df) - RECENT_CANDLES_WINDOW * 2]
    if not recent_fvgs:
        return None
    reasons.append(f"FVG {h4_bias} non comblée disponible sur {entry_tf}")

    structure_df = data[structure_tfs[0]]
    structure_swings = detect_swings(structure_df, lookback=swing_lookback)
    highs = [s.price for s in structure_swings if s.kind == "high"]
    lows = [s.price for s in structure_swings if s.kind == "low"]
    if not highs or not lows:
        return None

    current_price = entry_df["close"].iloc[-1]
    eq_cfg = indicators_cfg["equilibrium"]
    equilibrium = compute_equilibrium(
        swing_high=max(highs[-3:]),
        swing_low=min(lows[-3:]),
        current_price=current_price,
        discount_threshold=eq_cfg["discount_threshold"],
        premium_threshold=eq_cfg["premium_threshold"],
    )
    expected_zone = "discount" if h4_bias == "bullish" else "premium"
    if equilibrium.zone_of_price != expected_zone:
        return None
    reasons.append(f"prix en zone {expected_zone} (équilibrium {equilibrium.equilibrium:.2f})")

    impulsion_cfg = indicators_cfg["impulsion"]
    impulsion_df = classify_impulsion(
        entry_df,
        atr_period=atr_period,
        impulsion_ratio=impulsion_cfg["ratio"],
    )
    expected_signal = BULLISH_IMPULSION if h4_bias == "bullish" else BEARISH_IMPULSION
    recent_signals = impulsion_df["impulsion_signal"].iloc[-RECENT_CANDLES_WINDOW:]
    if not (recent_signals == expected_signal).any():
        return None
    reasons.append(f"bougie d'impulsion {h4_bias} détectée sur {entry_tf}")

    direction = "buy" if h4_bias == "bullish" else "sell"
    pip_size = instrument_cfg["pip_size"]
    sl_pips = instrument_cfg["sl_pips"]
    tp1_pips = instrument_cfg["tp1_pips"]
    tp2_pips = instrument_cfg["tp2_pips"]

    if direction == "buy":
        sl_price = current_price - sl_pips * pip_size
        tp1_price = current_price + tp1_pips * pip_size
        tp2_price = current_price + tp2_pips * pip_size
    else:
        sl_price = current_price + sl_pips * pip_size
        tp1_price = current_price - tp1_pips * pip_size
        tp2_price = current_price - tp2_pips * pip_size

    return TradeSetup(
        symbol=symbol,
        direction=direction,
        entry_price=current_price,
        sl_price=sl_price,
        tp1_price=tp1_price,
        tp2_price=tp2_price,
        tp3_trailing=instrument_cfg["tp3_trailing"],
        time=entry_df["time"].iloc[-1],
        reasons=reasons,
    )
