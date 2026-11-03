"""Fine-tune around the best sweep result with more games per configuration.

    python3 sim/refine.py
"""

import itertools
import json
import os
import sys
from multiprocessing import Pool

sys.path.insert(0, os.path.dirname(__file__))
from sweep import TARGETS, buydown_test, evaluate  # noqa: E402

BASE = dict(steps="trust", speed_bonus=(2, 1), backlash_slide=3, extra_len=4, mass_trust=6)
GRID = dict(
    payout=["first", "first_per_role", "placement", "order"],
    price_scale=[2, 3, 4],
    extra_len=[4, 6],
    backlash_slide=[2, 3],
    mass_trust=[5, 6],
)

if __name__ == "__main__":
    configs = [{**BASE, **dict(zip(GRID, v))} for v in itertools.product(*GRID.values())]
    with Pool() as pool:
        evals = pool.map(evaluate, [(p, 3000, 301) for p in configs])
        buys = pool.map(buydown_test, [(p, 3000, 401) for p in configs])
    for r, b in zip(evals, buys):
        r["buydown"] = b
        r["buy_spread"] = round(max(b.values()) - min(b.values()), 3)
        # a real trade-off: no buy-down habit wins by much (spread under 0.12)
        r["total"] = r["loss"] + max(0.0, r["buy_spread"] - 0.12) * 3
    evals.sort(key=lambda r: r["total"])
    json.dump(dict(targets=[d for d, _ in TARGETS], results=evals),
              open(os.path.join(os.path.dirname(__file__), "refine_results.json"), "w"), indent=1)
    for r in evals[:8]:
        p = r["params"]
        print(round(r["total"], 3), {k: p[k] for k in GRID}, "buy:", r["buydown"], "spread", r["buy_spread"])
        print("   pens:", [round(x, 2) for x in r["pens"]])
        print("   6r:", {k: r["m6"][k] for k in ("anyone_finishes", "dice_corr", "backlashes", "risk_bought", "race_leader_wins")},
              "| 8r:", r["m8"]["anyone_finishes"], r["m8"]["finishers_per_game"])
        print("   strat:", r["m6"]["strat"], "| profile:", r["m6"]["profile"],
              "| lean gaps H/L:", r["m6"]["lean_gap_high"], r["m6"]["lean_gap_low"])
