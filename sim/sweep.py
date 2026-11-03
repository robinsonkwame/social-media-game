"""Search configurations against the balance targets.

Stage 1 samples configurations and scores each on 6- and 8-round games.
Stage 2 reruns the finalists with more games and tests whether buying down risk
is a real trade-off (the best buy-down threshold should be neither "never" nor "always").

    python3 sim/sweep.py
"""

import itertools
import json
import os
import random
import sys
from multiprocessing import Pool

sys.path.insert(0, os.path.dirname(__file__))
from analyze import metrics  # noqa: E402
from viral_path_sim import STRATEGIES, Config, Strategy, run  # noqa: E402

STEP_SETS = {
    "low":  dict(step_target={"Delete": 0, "Apologize": 0, "Ignore": 1, "Lean in": 1}, step_support=0, step_critique=1, step_join=0),
    "mid":  dict(step_target={"Delete": 0, "Apologize": 1, "Ignore": 1, "Lean in": 2}, step_support=1, step_critique=2, step_join=1),
    "high": dict(step_target={"Delete": 0, "Apologize": 1, "Ignore": 2, "Lean in": 3}, step_support=1, step_critique=3, step_join=2),
    # movement follows trust: leaning in at Low trust slides you back
    "trust": dict(step_target={"Delete": 0, "Apologize": 1, "Ignore": (1, 1, 0), "Lean in": (3, 1, -1)}, step_support=1, step_critique=2, step_join=1),
    "trust_high": dict(step_target={"Delete": 0, "Apologize": 1, "Ignore": (2, 1, 0), "Lean in": (3, 1, -2)}, step_support=1, step_critique=3, step_join=2),
}

SPACE = dict(
    payout=["first", "all", "order", "placement", "progress"],
    extra_len=[0, 4, 8, 12, 16],
    backlash_slide=[1, 2, 3],
    steps=list(STEP_SETS),
    speed_bonus=[(2, 1), (1, 0)],
    price_scale=[1, 2, 4, 8],
    mass_trust=[5, 6],
)

# ------------------------------------------------------------- targets
# Each target is (description, function of metrics -> penalty >= 0).


def outside(x, lo, hi):
    return max(0.0, lo - x, x - hi)


def ratio(m, role, a, b, key="strat"):
    return m[key].get((role, a), 0) / max(1e-9, m[key].get((role, b), 1e-9))


TARGETS = [
    ("6-round race: someone finishes in 55-80% of games",
     lambda m6, m8: 3 * outside(m6["anyone_finishes"], 0.55, 0.80)),
    ("8-round race: someone finishes in 95%+ of games",
     lambda m6, m8: 3 * outside(m8["anyone_finishes"], 0.95, 1.0)),
    ("8-round race stays contested: 3.5 or fewer of 6 teams finish",
     lambda m6, m8: outside(m8["finishers_per_game"], 0, 3.5)),
    ("Choices beat dice: dice-rank correlation 0.35 or lower (6 rounds)",
     lambda m6, m8: 2 * outside(m6["dice_corr"], -1, 0.35)),
    ("Skill shows: Smart bots win 1.6x+ as often as Random bots",
     lambda m6, m8: sum(outside(ratio(m6, r, "Smart", "Random"), 1.6, 99) for r in ("brand", "infl"))),
    ("No reckless or timid strategy dominates: Bold and Cautious win index 0.8-1.25",
     lambda m6, m8: sum(outside(m6["strat"].get((r, s), 1), 0.8, 1.25) for r in ("brand", "infl") for s in ("Bold", "Cautious"))),
    ("Profiles balanced within each role (index ratio 0.9-1.1)",
     lambda m6, m8: 2 * (outside(ratio(m6, "brand", "Heritage", "Challenger", "profile"), 0.9, 1.1)
                         + outside(ratio(m6, "infl", "Niche", "Mass", "profile"), 0.9, 1.1))),
    ("McDonald's lesson: at High trust, Lean in beats Apologize",
     lambda m6, m8: outside(lean_gap(m6, "High"), 0.0, 99)),
    ("At Low trust, Lean in is the worst choice",
     lambda m6, m8: outside(-lean_gap(m6, "Low"), 0.0, 99)),
    ("The race decides it: the furthest team in a role wins 60%+ of the time",
     lambda m6, m8: 2 * outside(m6["race_leader_wins"], 0.6, 1.0)),
    ("Backlash is felt but not constant: 0.8-1.8 per team per game",
     lambda m6, m8: outside(m6["backlashes"], 0.8, 1.8)),
]


def lean_gap(m, band):
    fr = m["flop_response_win"]
    lean = fr.get(("Lean in", band), (1, 0))[0]
    others = [fr[(r, band)][0] for r in ("Apologize", "Ignore", "Delete") if (r, band) in fr]
    return lean - (max(others) if others else lean)


def make_cfg(params, rounds):
    s = params["price_scale"]
    return Config(
        rounds=rounds, payout=params["payout"], extra_len=params["extra_len"],
        backlash_slide=params["backlash_slide"], speed_bonus=tuple(params["speed_bonus"]),
        buy_brand=int(3000 * s), buy_infl=int(1000 * s),
        profile_overrides={"Mass": {"trust": params["mass_trust"]}},
        **STEP_SETS[params["steps"]],
    )


def evaluate(args):
    params, games, seed = args
    m6 = metrics(run(make_cfg(params, 6), games=games, seed=seed))
    m8 = metrics(run(make_cfg(params, 8), games=games, seed=seed + 1))
    pens = [f(m6, m8) for _, f in TARGETS]
    return dict(params=params, loss=sum(pens), pens=pens, m6=slim(m6), m8=slim(m8))


def slim(m):
    keys = ("anyone_finishes", "finishers_per_game", "progress", "backlashes", "risk_bought",
            "steps_from_choices", "payout_share", "dice_corr", "race_leader_wins")
    out = {k: round(m[k], 3) for k in keys}
    out["strat"] = {f"{a}:{b}": round(v, 2) for (a, b), v in m["strat"].items()}
    out["profile"] = {f"{a}:{b}": round(v, 2) for (a, b), v in m["profile"].items()}
    out["lean_gap_high"] = round(lean_gap(m, "High"), 3)
    out["lean_gap_low"] = round(lean_gap(m, "Low"), 3)
    return out


def buydown_test(args):
    """Win index of a focal Smart team at each buy-down threshold, others random archetypes."""
    params, games, seed = args
    out = {}
    for t in (2, 3, 4, 5, 99):
        focal = Strategy(f"Smart{t}", "adaptive", "trust", "adaptive", t)
        res = run(make_cfg(params, 6), games=games, seed=seed, focal=focal)
        out[t] = round(metrics(res)["focal_win"], 3)
    return out


if __name__ == "__main__":
    rng = random.Random(7)
    grid = [dict(zip(SPACE, v)) for v in itertools.product(*SPACE.values())]
    sample = rng.sample(grid, min(int(os.environ.get("N_CONFIGS", 700)), len(grid)))
    with Pool() as pool:
        stage1 = pool.map(evaluate, [(p, 500, 11) for p in sample])
    stage1.sort(key=lambda r: r["loss"])
    finalists = [r["params"] for r in stage1[:16]]
    with Pool() as pool:
        stage2 = pool.map(evaluate, [(p, 3000, 101) for p in finalists])
        buy = pool.map(buydown_test, [(p, 3000, 202) for p in finalists])
    for r, b in zip(stage2, buy):
        best = max(b, key=b.get)
        r["buydown"] = b
        # trade-off target: the best threshold is interior and beats never-buying
        r["buy_pen"] = (0 if best in (3, 4, 5) else 0.3) + max(0.0, 0.08 - (b[best] - b[99])) + max(0.0, 0.03 - (b[best] - b[2]))
        r["total"] = r["loss"] + r["buy_pen"]
    stage2.sort(key=lambda r: r["total"])
    json.dump(dict(targets=[d for d, _ in TARGETS], stage1_top=stage1[:30], stage2=stage2),
              open(os.path.join(os.path.dirname(__file__), "sweep_results.json"), "w"), indent=1)
    for r in stage2[:6]:
        print(round(r["total"], 3), r["params"], "buy:", r["buydown"])
        print("   pens:", [round(x, 2) for x in r["pens"]])
        print("   6r:", {k: r["m6"][k] for k in ("anyone_finishes", "dice_corr", "backlashes", "risk_bought", "race_leader_wins")},
              "8r finish/finishers:", r["m8"]["anyone_finishes"], r["m8"]["finishers_per_game"])
        print("   strat:", r["m6"]["strat"])
        print("   profile:", r["m6"]["profile"], "lean gaps:", r["m6"]["lean_gap_high"], r["m6"]["lean_gap_low"])
