"""Monte Carlo simulator for Viral Path.

Models the spec's economy (attention, trust, money, risk, paydays, deals, events)
plus the racing rules under test:
  - choices in the reaction window move a piece forward (step values),
  - a backlash slides a piece backward,
  - reaching the finish pays out up to $1M (several payout schemes).

Bots play fixed archetypes so we can see which choices and configurations win.
Everything is stdlib so it runs anywhere: python3 sim/viral_path_sim.py
"""

import random
from dataclasses import dataclass, field, replace

# ---------------------------------------------------------------- board

TRUNK1 = ["Deal", "Feed", "Event", "Talent", "Feed", "Payday", "Deal", "Fork"]
FORK1 = {"quiet": ["Feed", "Talent", "Deal", "Payday", "Feed", "Deal"],
         "viral": ["Event", "Deal", "Event", "Payday"]}
TRUNK2 = ["Deal", "Event", "Talent", "Payday", "Feed", "Fork"]
FORK2 = {"quiet": ["Deal", "Feed", "Talent", "Feed"],
         "viral": ["Event", "Event"]}
TRUNK3 = ["Deal", "Feed", "Event", "Talent", "Feed", "Deal", "Feed", "Finish"]
EXTRA_PATTERN = ["Feed", "Event", "Deal", "Feed"]


def build_path(c1, c2, extra):
    """Space list for one piece. Index 0 is the start (before space 1)."""
    tail = TRUNK3[:-1] + [EXTRA_PATTERN[i % 4] for i in range(extra)] + ["Finish"]
    return ["Start"] + TRUNK1 + FORK1[c1] + TRUNK2 + FORK2[c2] + tail


# ---------------------------------------------------------------- config


@dataclass
class Config:
    rounds: int = 6
    extra_len: int = 0                 # spaces added before the finish
    # movement from choices in the reaction window
    step_target: dict = field(default_factory=lambda: {"Delete": 0, "Apologize": 1, "Ignore": 1, "Lean in": 2})
    step_support: int = 1
    step_critique: int = 2
    step_join: int = 1                 # joining a Meme Format
    speed_bonus: tuple = (2, 1)        # first and second reactor
    backlash_slide: int = 2
    # money
    buy_brand: int = 3000
    buy_infl: int = 1000
    payday_mult: int = 100
    fee: int = 8000
    payout: str = "progress"           # first | all | order | placement | progress
    prize: int = 1_000_000
    tiers: tuple = (1.0, 0.5, 0.25)    # used by "order"
    profile_overrides: dict = field(default_factory=dict)  # e.g. {"Mass": {"trust": 5}}


PROFILES = {
    "Heritage":   dict(role="brand", money=40000, att=10, trust=8, gain=3),
    "Challenger": dict(role="brand", money=40000, att=20, trust=7, gain=6),
    "Niche":      dict(role="infl",  money=5000,  att=15, trust=8, gain=6),
    "Mass":       dict(role="infl",  money=5000,  att=25, trust=4, gain=8),
}
TAGS = ["Humor", "Food", "Fitness", "Value"]

FLOP_TABLE = {  # attention, trust at (High, Mid, Low), risk
    "Delete":    (7,  (-1, -1, -1), 0),
    "Apologize": (10, (0, 0, 0),    -1),
    "Ignore":    (15, (0, 0, -1),   0),
    "Lean in":   (25, (1, 0, -2),   1),
}
BRAND_FLOPS = ["Tiny Bite", "Logo Redesign", "Launch Ad Backlash"]
INFL_FLOPS = ["Missing Disclosure", "Copy-Paste Caption"]
OPEN_EVENTS = ["Meme Format", "Algorithm Shift", "Trend Spike"]


def trust_band(t):
    return 0 if t >= 7 else (1 if t >= 4 else 2)


# ---------------------------------------------------------------- strategies


@dataclass(frozen=True)
class Strategy:
    name: str
    fork: str          # viral | quiet | adaptive
    target: str        # lean | apologize | ignore | trust | random
    react: str         # critique | support | out | adaptive | random
    buy_at: int        # buy risk down to 1 when risk >= buy_at (99 = never)
    sign: bool = True  # brands: offer contracts


STRATEGIES = {
    "Bold":     Strategy("Bold", "viral", "lean", "critique", 99),
    "Cautious": Strategy("Cautious", "quiet", "apologize", "support", 2),
    "Smart":    Strategy("Smart", "adaptive", "trust", "adaptive", 3),
    "Random":   Strategy("Random", "random", "random", "random", 99),
}


# ---------------------------------------------------------------- game


class Team:
    def __init__(self, tid, profile, strat, rng, overrides=None):
        p = {**PROFILES[profile], **(overrides or {}).get(profile, {})}
        self.id, self.profile, self.role, self.strat = tid, profile, p["role"], strat
        self.money = self.start_money = p["money"]
        self.att, self.trust, self.gain = p["att"], p["trust"], p["gain"]
        self.risk = 1
        self.tag = rng.choice(TAGS) if self.role == "infl" else None
        self.pos = 0
        self.c1 = self.c2 = None
        self.paid = set()
        self.finished_round = None
        self.contracts = []            # [partner, rounds_left]
        self.past_partners = set()
        self.roll_total = 0
        self.backlashes = 0
        self.risk_bought = 0
        self.flops = []                # (trust_in, response, d_att, d_trust)
        self.steps_from_choices = 0

    def path(self, extra):
        return build_path(self.c1 or "quiet", self.c2 or "quiet", extra)


def choose_fork(team, rng):
    s = team.strat.fork
    if s == "random":
        return rng.choice(["quiet", "viral"])
    if s == "adaptive":
        return "viral" if team.risk <= 1 else "quiet"
    return s


def target_response(team, card, rng):
    s = team.strat.target
    if s == "random":
        return rng.choice(list(FLOP_TABLE))
    if s == "trust":
        band = trust_band(team.trust)
        return ["Lean in", "Ignore", "Apologize"][band]
    return {"lean": "Lean in", "apologize": "Apologize", "ignore": "Ignore"}[s]


def reaction(team, target, rng, cfg):
    s = team.strat.react
    if s == "random":
        return rng.choice(["Support", "Critique", "Out"])
    if s == "adaptive":
        # critique only when the extra risk is safe and the target is unlikely to lean in at High trust
        safe = team.risk + 2 <= 2 or team.money >= buy_cost(team, cfg) * 2
        if trust_band(target.trust) == 0:
            return "Support"
        return "Critique" if safe else "Support"
    return {"critique": "Critique", "support": "Support", "out": "Out"}[s]


def buy_cost(team, cfg):
    return cfg.buy_brand if team.role == "brand" else cfg.buy_infl


class Game:
    def __init__(self, cfg, lineup, rng):
        """lineup: list of (profile, Strategy)."""
        self.cfg, self.rng = cfg, rng
        self.teams = [Team(i, p, s, rng, cfg.profile_overrides) for i, (p, s) in enumerate(lineup)]
        self.finish_order = []

    # -- helpers
    def path(self, t):
        return t.path(self.cfg.extra_len)

    def advance(self, t, n, pay=True):
        """Move forward n spaces, choosing forks lazily and crediting paydays."""
        for _ in range(n):
            if t.finished_round is not None:
                return
            path = self.path(t)
            nxt = t.pos + 1
            # decide forks when the piece first needs the route beyond them
            if t.c1 is None and nxt > len(["Start"] + TRUNK1) - 1:
                t.c1 = choose_fork(t, self.rng)
                if t.c1 == "viral":
                    t.risk += 1
            path = self.path(t)
            fork2_idx = 1 + len(TRUNK1) + len(FORK1[t.c1 or "quiet"]) + len(TRUNK2)
            if t.c2 is None and nxt > fork2_idx - 1 and t.c1 is not None:
                t.c2 = choose_fork(t, self.rng)
                if t.c2 == "viral":
                    t.risk += 1
            path = self.path(t)
            t.pos = nxt
            space = path[t.pos]
            if pay and space in ("Payday", "Finish") and t.pos not in t.paid:
                t.paid.add(t.pos)
                t.money += t.att * t.trust * self.cfg.payday_mult
            if space == "Finish":
                t.finished_round = self.round
                self.finish_order.append(t)
                return

    def retreat(self, t, n):
        if t.finished_round is None:
            t.pos = max(0, t.pos - n)

    def space(self, t):
        return self.path(t)[t.pos]

    # -- round phases
    def play(self):
        cfg, rng = self.cfg, self.rng
        for self.round in range(1, cfg.rounds + 1):
            active = [t for t in self.teams if t.finished_round is None]
            rolls = {t.id: rng.randint(1, 6) for t in self.teams}
            for t in active:
                t.roll_total += rolls[t.id]
                self.advance(t, rolls[t.id])
                if t.finished_round is None and t.risk > rolls[t.id]:
                    t.trust = max(1, t.trust - 1)
                    t.att = max(0, t.att - 10)
                    t.risk = max(0, t.risk - 2)
                    t.backlashes += 1
                    self.retreat(t, cfg.backlash_slide)

            trend = rng.choice(TAGS)
            self.deal_window(trend)

            # event
            on_event = [t for t in self.teams if t.finished_round is None and self.space(t) == "Event"]
            if self.round == 1:
                brands = [t for t in self.teams if t.role == "brand"]
                pool = brands or [t for t in self.teams if t.role == "infl"]
                target = rng.choice(pool)
                card = "Tiny Bite" if brands else "Missing Disclosure"
                minors = [t for t in on_event if t is not target]
                self.flop(target, card)
            elif on_event:
                target = min(on_event, key=lambda t: (rolls[t.id], rng.random()))
                card = rng.choice(BRAND_FLOPS if target.role == "brand" else INFL_FLOPS)
                minors = [t for t in on_event if t is not target]
                self.flop(target, card)
            else:
                minors = []
                self.open_event(rng.choice(OPEN_EVENTS), trend)
            for t in minors:
                t.att += 5
                t.risk += 1

            self.resolve(trend)
        return self.score()

    def deal_window(self, trend):
        cfg, rng = self.cfg, self.rng
        # risk buy-down
        for t in self.teams:
            if t.risk >= t.strat.buy_at:
                price = cfg.buy_brand if t.role == "brand" else cfg.buy_infl
                want = t.risk - 1
                reserve = cfg.fee if (t.role == "brand" and t.strat.sign) else 0
                can = max(0, (t.money - reserve) // price)
                n = min(want, can)
                if t.strat.name == "Random":
                    n = rng.randint(0, n) if n > 0 else 0
                t.money -= n * price
                t.risk -= n
                t.risk_bought += n
        # contracts: each free brand offers the fee to the best available influencer
        free_infl = [t for t in self.teams if t.role == "infl" and len(t.contracts) < 1]
        rng.shuffle(free_infl)
        for b in [t for t in self.teams if t.role == "brand" and not t.contracts and t.strat.sign]:
            if b.money < cfg.fee or not free_infl:
                continue
            if b.strat.name == "Random" and rng.random() < 0.5:
                continue
            # prefer the trend match, then attention
            infl = max(free_infl, key=lambda i: (i.tag == trend, i.att, rng.random()))
            free_infl.remove(infl)
            b.money -= cfg.fee
            infl.money += cfg.fee
            if infl.trust <= 3:
                b.risk += 1
            if infl.id in b.past_partners:
                b.trust = min(10, b.trust + 1)
                infl.trust = min(10, infl.trust + 1)
            b.past_partners.add(infl.id)
            infl.past_partners.add(b.id)
            b.contracts.append([infl, 2])
            infl.contracts.append([b, 2])

    def flop(self, target, card):
        cfg, rng = self.cfg, self.rng
        resp = target_response(target, card, rng)
        d_att, d_trust_by_band, d_risk = FLOP_TABLE[resp]
        band = trust_band(target.trust)
        trust_in = target.trust
        if card == "Logo Redesign" and resp == "Delete":
            d_att = 0
        d_trust = d_trust_by_band[band]
        target.att += d_att
        target.trust = min(10, max(1, target.trust + d_trust))
        target.risk = max(0, target.risk + d_risk)
        if card == "Missing Disclosure":
            for partner, _ in target.contracts:
                partner.trust = min(10, max(1, partner.trust + d_trust))
        target.flops.append((trust_in, resp, d_att, d_trust))
        step = cfg.step_target[resp]
        if isinstance(step, (tuple, list)):
            step = step[band]
        target.steps_from_choices += step
        if step >= 0:
            self.advance(target, step)
        else:
            self.retreat(target, -step)

        reactors = []
        for t in self.teams:
            if t is target or t.finished_round is not None:
                continue
            r = reaction(t, target, rng, cfg)
            if r == "Support":
                t.att += 5
                reactors.append((t, cfg.step_support))
            elif r == "Critique":
                t.att += 10
                t.risk += 2
                if resp == "Lean in" and band == 0:
                    t.trust = max(1, t.trust - 1)
                reactors.append((t, cfg.step_critique))
        rng.shuffle(reactors)
        for i, (t, step) in enumerate(reactors):
            bonus = cfg.speed_bonus[i] if i < len(cfg.speed_bonus) else 0
            t.steps_from_choices += step + bonus
            self.advance(t, step + bonus)

    def open_event(self, card, trend):
        cfg, rng = self.cfg, self.rng
        if card == "Meme Format":
            joiners = []
            for t in self.teams:
                if t.finished_round is not None:
                    continue
                s = t.strat.react
                join = {"critique": True, "support": True, "out": False,
                        "adaptive": t.risk <= 2, "random": rng.random() < 0.5}[s]
                if join:
                    t.att += 8
                    t.risk += 1
                    joiners.append(t)
            rng.shuffle(joiners)
            for i, t in enumerate(joiners):
                bonus = cfg.speed_bonus[i] if i < len(cfg.speed_bonus) else 0
                t.steps_from_choices += cfg.step_join + bonus
                self.advance(t, cfg.step_join + bonus)
        elif card == "Algorithm Shift":
            for t in self.teams:
                if t.role == "brand" and t.contracts and not any(p.tag == trend for p, _ in t.contracts):
                    t.att = max(0, t.att - 5)
        elif card == "Trend Spike":
            for t in self.teams:
                if t.role == "infl" and t.tag == trend:
                    t.att += 10

    def resolve(self, trend):
        for t in self.teams:
            t.att += t.gain
            for partner, _ in t.contracts:
                if t.role == "brand":
                    t.att += partner.att if partner.tag == trend else partner.att // 2
                else:
                    t.att += 3
            if t.role == "infl" and len(t.contracts) >= 2:
                t.trust = max(1, t.trust - 1)
        for t in self.teams:
            for c in t.contracts:
                c[1] -= 1
            t.contracts = [c for c in t.contracts if c[1] > 0]
            t.att = min(100, max(0, t.att))
            t.att -= t.att // 4

    # -- scoring
    def score(self):
        cfg = self.cfg
        payout = {t.id: 0 for t in self.teams}
        lengths = {t.id: len(self.path(t)) - 1 for t in self.teams}
        if cfg.payout == "progress":
            for t in self.teams:
                payout[t.id] = int(cfg.prize * t.pos / lengths[t.id])
        elif cfg.payout == "all":
            for t in self.finish_order:
                payout[t.id] = cfg.prize
        elif cfg.payout == "first":
            if self.finish_order:
                payout[self.finish_order[0].id] = cfg.prize
            else:
                lead = max(self.teams, key=lambda t: (t.pos / lengths[t.id], self.rng.random()))
                payout[lead.id] = cfg.prize
        elif cfg.payout == "first_per_role":
            # $1M to the first finisher in each role, or the furthest piece if no one in that role finished
            for role in ("brand", "infl"):
                grp = [t for t in self.teams if t.role == role]
                fin = [t for t in self.finish_order if t.role == role]
                win = fin[0] if fin else max(grp, key=lambda t: (t.pos / lengths[t.id], self.rng.random()))
                payout[win.id] = cfg.prize
        elif cfg.payout == "placement":
            for role in ("brand", "infl"):
                grp = [t for t in self.teams if t.role == role]
                fin = {t.id: i for i, t in enumerate(self.finish_order)}
                grp.sort(key=lambda t: (t.id not in fin, fin.get(t.id, 0), -t.pos / lengths[t.id], self.rng.random()))
                for i, t in enumerate(grp[:len(cfg.tiers)]):
                    payout[t.id] = int(cfg.prize * cfg.tiers[i])
        elif cfg.payout == "order":
            for role in ("brand", "infl"):
                order = [t for t in self.finish_order if t.role == role]
                for i, t in enumerate(order[:len(cfg.tiers)]):
                    payout[t.id] = int(cfg.prize * cfg.tiers[i])
        out = []
        for t in self.teams:
            net = t.money - t.start_money + payout[t.id]
            out.append(dict(
                id=t.id, role=t.role, profile=t.profile, strat=t.strat.name,
                buy_at=t.strat.buy_at, net=net, payout=payout[t.id],
                money_only=t.money - t.start_money, progress=t.pos / lengths[t.id],
                finished=t.finished_round is not None, finished_round=t.finished_round,
                rolls=t.roll_total, backlashes=t.backlashes, risk_bought=t.risk_bought,
                steps=t.steps_from_choices, flops=t.flops, trust=t.trust,
            ))
        return out


# ---------------------------------------------------------------- runs


def random_lineup(rng, n_brand=3, n_infl=3, pool=("Bold", "Cautious", "Smart", "Random"), focal=None):
    lineup = []
    for i in range(n_brand):
        lineup.append((rng.choice(["Heritage", "Challenger"]), STRATEGIES[rng.choice(pool)]))
    for i in range(n_infl):
        lineup.append((rng.choice(["Niche", "Mass"]), STRATEGIES[rng.choice(pool)]))
    if focal is not None:
        idx = rng.randrange(len(lineup))
        lineup[idx] = (lineup[idx][0], focal)
        return lineup, idx
    return lineup, None


def run(cfg, games=2000, seed=1, n_brand=3, n_infl=3, focal=None):
    rng = random.Random(seed)
    results = []
    for _ in range(games):
        lineup, idx = random_lineup(rng, n_brand, n_infl, focal=focal)
        res = Game(cfg, lineup, rng).play()
        for role in ("brand", "infl"):
            group = [r for r in res if r["role"] == role]
            best = max(r["net"] for r in group)
            winners = [r for r in group if r["net"] == best]
            for r in group:
                r["win"] = 1 / len(winners) if r in winners else 0
                r["rank"] = 1 + sum(1 for o in group if o["net"] > r["net"])
                r["group_n"] = len(group)
        if idx is not None:
            res[idx]["focal"] = True
        results.append(res)
    return results


if __name__ == "__main__":
    from analyze import summarize
    summarize(Config(), run(Config()))
