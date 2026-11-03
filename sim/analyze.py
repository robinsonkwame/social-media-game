"""Metrics and balance targets for Viral Path simulation runs."""

from collections import defaultdict
from statistics import mean


def pearson(xs, ys):
    mx, my = mean(xs), mean(ys)
    sx = sum((x - mx) ** 2 for x in xs) ** 0.5
    sy = sum((y - my) ** 2 for y in ys) ** 0.5
    if sx == 0 or sy == 0:
        return 0.0
    return sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / (sx * sy)


def metrics(results):
    rows = [r for g in results for r in g]
    m = {}
    m["anyone_finishes"] = mean(1 if any(r["finished"] for r in g) else 0 for g in results)
    m["finishers_per_game"] = mean(sum(r["finished"] for r in g) for g in results)
    m["progress"] = mean(r["progress"] for r in rows)
    m["backlashes"] = mean(r["backlashes"] for r in rows)
    m["risk_bought"] = mean(r["risk_bought"] for r in rows)
    m["steps_from_choices"] = mean(r["steps"] for r in rows)
    m["payout_share"] = mean(r["payout"] / r["net"] if r["net"] > 0 else 0 for r in rows)
    # does the race decide the game? share of role winners who were furthest along in their role
    lead = []
    for g in results:
        for role in ("brand", "infl"):
            grp = [r for r in g if r["role"] == role]
            far = max(r["progress"] for r in grp)
            lead += [1 if r["progress"] == far else 0 for r in grp if r["win"] > 0]
    m["race_leader_wins"] = mean(lead)

    # win rate within role by strategy and by profile (baseline = 1 / group size)
    for key in ("strat", "profile"):
        acc = defaultdict(list)
        for r in rows:
            acc[(r["role"], r[key])].append(r["win"] * r["group_n"])  # 1.0 = fair share
        m[key] = {k: mean(v) for k, v in acc.items()}

    # dice luck: correlation of a team's roll total with its within-role rank (1 = best)
    xs, ys = [], []
    for g in results:
        for role in ("brand", "infl"):
            grp = [r for r in g if r["role"] == role]
            mr = mean(r["rolls"] for r in grp)
            for r in grp:
                xs.append(r["rolls"] - mr)
                ys.append(-(r["rank"] - (len(grp) + 1) / 2))
    m["dice_corr"] = pearson(xs, ys)

    # McDonald's check: lean in by trust band
    lean = defaultdict(list)
    for r in rows:
        for trust_in, resp, d_att, d_trust in r["flops"]:
            band = "High" if trust_in >= 7 else ("Mid" if trust_in >= 4 else "Low")
            lean[(resp, band)].append(r["win"] * r["group_n"])
    m["flop_response_win"] = {k: (mean(v), len(v)) for k, v in lean.items()}

    focal = [r for r in rows if r.get("focal")]
    if focal:
        m["focal_win"] = mean(r["win"] * r["group_n"] for r in focal)
    return m


def summarize(cfg, results, title=None):
    m = metrics(results)
    print(f"\n=== {title or cfg.payout} | rounds={cfg.rounds} extra={cfg.extra_len} slide={cfg.backlash_slide} ===")
    print(f"anyone finishes {m['anyone_finishes']:.0%} | finishers/game {m['finishers_per_game']:.2f} | "
          f"avg progress {m['progress']:.0%} | backlashes/team {m['backlashes']:.2f} | "
          f"risk bought/team {m['risk_bought']:.2f} | choice steps/team {m['steps_from_choices']:.1f}")
    print(f"payout share of net {m['payout_share']:.0%} | dice-rank corr {m['dice_corr']:.2f}")
    print("strategy win index (1.0 = fair share):",
          {f"{k[0]}:{k[1]}": round(v, 2) for k, v in sorted(m["strat"].items())})
    print("profile win index:", {f"{k[0]}:{k[1]}": round(v, 2) for k, v in sorted(m["profile"].items())})
    return m
