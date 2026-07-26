from dataclasses import dataclass


@dataclass
class EquilibriumZone:
    swing_high: float
    swing_low: float
    equilibrium: float
    zone_of_price: str  # "premium" ou "discount"

    @property
    def fib_618(self) -> float:
        return self.swing_low + (self.swing_high - self.swing_low) * 0.382

    @property
    def fib_705(self) -> float:
        return self.swing_low + (self.swing_high - self.swing_low) * 0.295


def compute_equilibrium(swing_high: float, swing_low: float, current_price: float,
                         discount_threshold: float = 0.5, premium_threshold: float = 0.5) -> EquilibriumZone:
    equilibrium = swing_low + (swing_high - swing_low) * 0.5
    ratio = (current_price - swing_low) / (swing_high - swing_low) if swing_high != swing_low else 0.5
    zone = "discount" if ratio <= discount_threshold else "premium"
    return EquilibriumZone(swing_high=swing_high, swing_low=swing_low, equilibrium=equilibrium, zone_of_price=zone)
