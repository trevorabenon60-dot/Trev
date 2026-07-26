import MetaTrader5 as mt5
import pandas as pd

TIMEFRAME_MAP = {
    "M1": mt5.TIMEFRAME_M1,
    "M5": mt5.TIMEFRAME_M5,
    "M15": mt5.TIMEFRAME_M15,
    "M30": mt5.TIMEFRAME_M30,
    "H1": mt5.TIMEFRAME_H1,
    "H4": mt5.TIMEFRAME_H4,
    "D1": mt5.TIMEFRAME_D1,
}


class DataFeed:
    def get_ohlcv(self, symbol: str, timeframe: str, count: int = 300) -> pd.DataFrame:
        tf = TIMEFRAME_MAP.get(timeframe)
        if tf is None:
            raise ValueError(f"Timeframe inconnu: {timeframe}")

        rates = mt5.copy_rates_from_pos(symbol, tf, 0, count)
        if rates is None or len(rates) == 0:
            raise RuntimeError(f"Aucune donnée reçue pour {symbol} {timeframe}: {mt5.last_error()}")

        df = pd.DataFrame(rates)
        df["time"] = pd.to_datetime(df["time"], unit="s")
        df = df.rename(columns={"tick_volume": "volume"})
        return df[["time", "open", "high", "low", "close", "volume"]]

    def get_multi_timeframe(self, symbol: str, timeframes: list[str], count: int = 300) -> dict[str, pd.DataFrame]:
        return {tf: self.get_ohlcv(symbol, tf, count) for tf in timeframes}
