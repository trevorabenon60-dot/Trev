# Bot de trading automatique MT5 — Stratégie SMC/ICT

Bot Python qui se connecte à MetaTrader 5 et automatise ta stratégie :
biais directionnel H4 (BOS), confirmation de structure H1/M30/M15, entrée en M1
sur confluence FVG + order block + prise de liquidité + zone discount/premium
(équilibrium Fibonacci) + ton indicateur de mèche d'impulsion (basé sur l'ATR).

**⚠️ Avertissement** : le trading algorithmique comporte un risque de perte en capital.
Ce bot n'est pas garanti sans bug. Teste-le plusieurs semaines en compte démo,
vérifie chaque trade qu'il prend par rapport à ton analyse manuelle, avant même
d'envisager un compte réel.

## Pré-requis

Le package `MetaTrader5` ne fonctionne qu'avec un terminal MT5 **Windows**
(nativement, ou via Wine sur Mac/Linux, ou dans une VM/VPS Windows). Ce bot
doit tourner sur la même machine que le terminal MT5, connecté à ton compte.

- Python 3.11+
- Terminal MT5 installé et connecté à ton compte (démo pour commencer)
- `pip install -r requirements.txt`

## Installation

```bash
cd mt5_bot
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt
copy .env.example .env         # puis remplis MT5_LOGIN / MT5_PASSWORD / MT5_SERVER
```

## Configuration (`config/config.yaml`)

- `instruments.BTCUSD.symbol` / `instruments.XAUUSD.symbol` : adapte au nom exact
  chez ton broker (ex: `BTCUSD.p`, `XAUUSD.p` si suffixe).
- `risk.risk_per_trade_pct` / `risk.daily_loss_limit_pct` : 1% par défaut comme demandé.
- `risk.max_concurrent_setups` : nombre d'**idées de trade** ouvertes en même temps
  (chaque idée = 3 tickets répartis sur TP1/TP2/TP3), tous instruments confondus.
- `instruments.*.sl_pips / tp1_pips / tp2_pips` : reprennent tes règles
  (BTC: SL 300 / TP1 300 (= seuil BE) / TP2 600 / TP3 ouvert en trailing ;
  Gold: SL 40 (réglable 30-50) / TP1 10 (= seuil BE) / TP2 30 / TP3 60 en trailing).
- `indicators.wick_impulsion.impulsion_ratio` / `strong_impulsion_ratio` : seuils
  mèche/ATR pour ton indicateur de mèche d'impulsion — **à calibrer** (voir plus bas).

## Lancer le bot

```bash
python main.py
```

Le bot tourne en boucle (intervalle `execution.poll_interval_seconds`), journalise
dans `logs/bot.log`, et sur chaque cycle :
1. Gère les positions ouvertes (passage à Break Even dès qu'un TP est touché, trailing du 3e ticket).
2. Si aucun coupe-circuit journalier n'est déclenché et qu'aucune idée n'est déjà en cours,
   cherche un setup valide sur BTCUSD et XAUUSD.
3. Si un setup est trouvé, calcule la taille de lot pour 1% de risque et envoie les 3 ordres.

Arrêt propre avec `Ctrl+C`.

## Comment la stratégie est implémentée

| Ta règle | Fichier | Logique |
|---|---|---|
| Biais H4 (BOS) | `strategy/bias_engine.py`, `indicators/structure.py` | Swings + séquence BOS/CHoCH |
| Confirmation H1/M30/M15 | `strategy/confluence.py` | Exige le même biais sur ces 3 TF |
| FVG / imbalance | `indicators/fvg.py` | Pattern 3 bougies classique, filtré par taille min (ATR) |
| Order block | `indicators/order_blocks.py` | Dernière bougie opposée avant la bougie qui crée la FVG |
| Prise de liquidité | `indicators/liquidity.py` | Mèche qui dépasse un swing puis clôture de l'autre côté |
| Équilibrium / Fibo | `indicators/equilibrium.py` | 50% du dernier swing H1, filtre discount/premium |
| Mèche d'impulsion | `indicators/wick_impulsion.py` | Ratio mèche haute/basse vs ATR(14), 2 seuils (normal/impulsion/forte) |
| SL 300 pips BTC / 30-50 Gold | `strategy/confluence.py` (calcul SL/TP) | Distance fixe en pips depuis config.yaml |
| BE au seuil TP1 | `execution/position_monitor.py` | Dès qu'un ticket ferme (TP touché), les autres passent au prix d'entrée |
| TP1/TP2/TP3 + 3 trades simultanés | `execution/risk_manager.py` + `execution/order_manager.py` | 1 setup = 3 ordres, `risk.split_ratios` répartit le lot total |
| 1% risque, 1% max perte/jour | `execution/risk_manager.py` | Lot calculé via `trade_tick_value`, kill-switch sur l'équité du jour |

## ⚠️ À calibrer avant tout usage réel

Ton indicateur de mèche d'impulsion et tes définitions de FVG/order block/liquidité
sont reconstruits ici avec des règles génériques (standards ICT/SMC + ratio ATR).
Elles ne reproduisent pas forcément à 100% ce que tu vois sur tes charts.
Avant de laisser tourner le bot :

1. Fais tourner le bot **sans qu'il exécute d'ordres** (tu peux commenter l'appel à
   `order_manager.open_setup` dans `main.py` et juste logger les setups détectés)
   pendant quelques jours, et compare les setups détectés à ton analyse manuelle.
2. Ajuste `indicators.wick_impulsion.impulsion_ratio` jusqu'à ce que les bougies
   bleues/violettes détectées correspondent à celles que tu marques toi-même.
3. Seulement ensuite, active l'exécution réelle en démo, puis en réel après
   plusieurs semaines concluantes.

## Prochaines étapes possibles

- Notifications Telegram/Discord à chaque setup détecté et à chaque ordre exécuté.
- Module de backtesting sur données historiques MT5 pour valider les seuils avant le live.
- Dashboard de suivi (P&L journalier, R-multiple par trade, comme sur tes screenshots).
