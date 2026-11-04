# Viral Path balance simulation: results

**Question:** If the finish pays $1M, choices move pieces, and a backlash slides a piece backward, which values make a good game?

**Method:**
- [viral_path_sim.py](viral_path_sim.py) plays the full spec economy with six teams (3 brands, 3 influencers) using bot strategies.
- [sweep.py](sweep.py) scored 900 sampled configurations against the balance targets below.
- [refine.py](refine.py) reran the best area with 3,000 games per configuration.
- The final check used 6,000 games.

## Bot strategies

| Bot | Fork | As flop target | As reactor | Buys down risk |
|---|---|---|---|---|
| Bold | viral | always Lean in | always Critique | never |
| Cautious | quiet | always Apologize | always Support | at 2+ |
| Smart | viral only when risk is low | follows trust: Lean in at High, Ignore at Mid, Apologize at Low | Critique when it can afford the risk; Support a High-trust target | at 3+ |
| Random | random | random | random | sometimes |

The **win index** is a strategy's share of wins within its role. 1.0 is a fair share, 1.3 means 30% more wins than fair.

## Recommended configuration

| Setting | Spec today | Recommended |
|---|---|---|
| Finish reward | $10,000 + 5 attention | **$1,000,000 to the first team to finish (any role).** If no one finishes, the furthest piece gets it. The finish still counts as a payday |
| Board length | 32 quiet / 28 viral | **36 / 32**: add Feed, Event, Deal, Feed before the finish |
| Backlash | −1 trust, −10 attention, −2 risk | the same, **plus slide back 3 spaces** |
| Risk buy-down | $3,000 brand / $1,000 influencer per point | **$12,000 / $4,000** |
| Flop target movement | none | Delete **0** · Apologize **+1** · Ignore **+1** (0 at Low trust) · Lean in **+3** at High, **+1** at Mid, **−1** (back) at Low |
| Reactor movement | none | Support **+1** · Critique **+2** · join a Meme Format **+1** |
| Speed bonus | first two reactors +2 / +1 | unchanged |
| Mass creator trust | 4 | **6** |
| Everything else (payday formula, fees, decay, profiles) | — | unchanged |

## How the recommended configuration scores (6,000 games)

| Target | Result | Met? |
|---|---|---|
| 6 rounds: someone finishes in 55–80% of games | 50% | close (the spec measured 45%) |
| 8 rounds: someone finishes in 95%+ of games | 99% | ✅ |
| 8 rounds stays contested: 3.5 or fewer of 6 teams finish | 3.3 | ✅ |
| Choices matter more than dice: dice-rank correlation ≤ 0.35 | 0.27 (spec movement: 0.38) | ✅ |
| Skill shows: Smart wins 1.6x+ as often as Random | brands 2.0x · influencers 1.8x | ✅ |
| No reckless or timid strategy dominates (0.8–1.25) | Bold 1.01 / 0.79 · Cautious 1.01 / 1.10 | ✅ (influencer Bold just under) |
| Profiles balanced within role | Heritage 1.00 vs Challenger 1.00 · Niche 1.05 vs Mass 0.95 | ✅ |
| McDonald's lesson: at High trust, Lean in beats Apologize | 1.65 vs 1.08 | ✅ |
| At Low trust, Lean in is worst | 0.20, the lowest of every response | ✅ |
| The race decides most games | the furthest team in its role wins 69% (89% in 8 rounds) | ✅ |
| Backlash is felt but not constant | 1.3 per team per game | ✅ |
| Buying down risk is a real trade-off | Smart bots buying at 2 / 3 / 4 / 5 / never: 1.37 / 1.31 / 1.27 / 1.29 / 1.31 | ✅ no habit wins by more than 0.10 |

## What the sweep found

1. **One $1M prize for the whole class works best.** Paying $1M per role, or paying by race placement, made the dice decide most games (dice-rank correlation 0.49–0.71). With a single prize, the race decides most games and dice still don't dominate. The rest of each role's ranking comes down to money from paydays.
2. **Movement should follow trust.** Fixed step values let teams lean in at Low trust and still come out ahead. Making Lean in at Low trust slide a piece back 1 space makes the McDonald's lesson show up in play: leaning in only pays when trust is high.
3. **Money has to be scarce for buy-down to be a choice.** At the spec's prices, buying risk down early was always right. At $12,000 / $4,000 per point, a brand weighs one point of risk against most of an $8,000 contract, and an influencer can afford about one point. No buying habit dominates, which is the trade-off you saw in your earlier game.
4. **Spec movement alone makes Bold too strong.** With movement from dice only, Bold bots won 1.26x as often as fair. Step values and the 3-space slide bring Bold and Cautious to about even.

## Limits

- Bots aren't students. Real teams will react faster or slower, coordinate, and bid differently.
- The deal logic is simplified: brands offer the flat $8,000 fee to the best available influencer, and there's no bidding war.
- It models six teams split 3 and 3. The spec allows 4–7 teams and uneven splits with NPCs, which weren't simulated.
- The 6-round finish rate of 50% is just under the target. Shortening the extra stretch to 2 spaces would raise it, at some cost to the 8-round contest.

## Rerun

```bash
python3 sim/sweep.py
python3 sim/refine.py
```
Results are saved to `sim/sweep_results.json` and `sim/refine_results.json`.

## Update: 1–3 die, no speed bonus

After playtesting, the speed bonus was removed (a team that tapped first every round gained about 12 spaces in six rounds) and the movement die became a host setting, 1–3 by default. The risk check is now its own 1–6 roll, so backlash odds don't change with the die. This Python model was not rerun; these numbers come from 400 all-bot games (3 brands, 3 influencers) through the real engine in `public/js`:

| Die | Speed bonus | Someone finishes by round 6 | by round 8 | Average progress after 6 rounds |
|---|---|---|---|---|
| 1–6 | +2 / +1 (old) | 63% | 100% | 76% |
| 1–6 | none | 25% | 95% | 69% |
| 1–5 | none | 2% | 64% | 61% |
| 1–4 | none | 0% | 13% | 52% |
| 1–3 | none | 0% | 0% | 43% |

With 1–3, the $1M almost always goes to the piece furthest along rather than a finisher.
