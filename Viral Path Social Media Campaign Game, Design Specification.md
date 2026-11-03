# Viral Path: Social Media Campaign Game, Design Specification

Nov 2, 2026 · @Kwame

## Purpose and learning goals

Viral Path is a 20 to 25 minute team game in which brand teams and influencer teams move along a shared board, sign deals, and respond to social media events. Each mechanic exists to produce evidence for one of the three discussion questions in Isabella Otero's Week 10 case study on the McDonald's Big Arch video.

The first question asks whether McDonald's result was a marketing success or a lucky accident. No team chooses to be the target of a flop, so the game logs each target's trust going in and what the flop gained or cost it; Otero attributes McDonald's resilience to trust built over decades, and the log shows whether earlier trust turned an accident into a gain.

The second question asks who won the moment once Burger King and Wendy's joined at no cost. The game records the attention each team gained from events that targeted another team.

The third question asks how to tell whether attention built long-term value. Attention and trust are tracked separately, and trust sets how much attention converts into money.

The report-out on these questions happens outside the game. A mechanic that produces no evidence for any of the three should be cut during playtesting.

## Session formats

The classroom game runs six rounds by default, and the instructor can extend it to eight at the end of round six. Self-play is a short tutorial assigned before class so students arrive knowing the mechanics.

| Format | Players | Board | Rounds | Length |
| --- | --- | --- | --- | --- |
| Classroom | 4 to 7 teams of 2 to 4 students | 36 spaces, two forks | 6, extendable to 8 | 20 to 25 min |
| Self-play | 1 learner and 1 bot | 10 spaces | 5 | about 6 min |
| Solo test | 1 player and 5 bots | the classroom board | 6, extendable to 8 | about 15 min |

For a class of 17, the classroom timing is about 2 minutes to open, 2 minutes per round, and 5 minutes for the end summary and buffer. Six rounds give roughly 19 minutes and eight give roughly 23.

The solo test is for the instructor: one team plays the full classroom game against five bots with fixed styles (Bold, Cautious, Smart, and Random), with an optional untimed mode. It is built as `public/solo.html` and served at `/solo`.

Students join by a phone link and pick roles as they arrive, so the clock starts at round one. The first event card is scripted as a flopped launch video, which teaches the reaction window by example.

## Roles, profiles, and team setup

Each team picks a role and a profile at join time, and students choose freely. The role-selection screen shows a live count of brand and influencer teams so students can see which side is short.

| Role | Profile | Money | Attention | Trust | Attention gained per round |
| --- | --- | --- | --- | --- | --- |
| Brand | Heritage | $40,000 | 10 | 8 | +3 |
| Brand | Challenger | $40,000 | 20 | 7 | +6 |
| Influencer | Niche creator | $5,000 | 15 | 8 | +6 |
| Influencer | Mass creator | $5,000 | 25 | 6 | +8 |

These values were set by simulation so that the two profiles in each role win about equally often. The spec's first values left Heritage brands well ahead of Challengers and Mass creators well ahead of Niche creators. After the racing rules were added, Mass creators at trust 4 fell well behind Niche creators, so Mass trust was raised to 6; in 6,000 simulated games Heritage and Challenger win equally often, and Niche and Mass win within about 10% of each other. The simulation and its results are in `sim/RESULTS.md`.

All teams start with 1 risk point. Influencer teams also pick one trend tag from Humor, Food, Fitness, and Value. Every team plays under an anonymous handle, with a generated face for influencers and a generated logo for brands; team names and logos are fictional, while event cards use real brands and people.

Computer-controlled pieces fill whichever side is short. With more brand teams than influencer teams, the game activates one NPC influencer per missing team, up to three, on the talent spaces. Each has 20 attention, 5 trust, one trend tag, and a fixed fee of $8,000, and accepts the first offer at or above that fee without weighing others.

With more influencer teams than brand teams, one NPC brand offer per missing team appears each round: $6,000 for a two-round contract, open to any influencer. NPC brands never raise an offer during the final call. Equal numbers activate no NPCs.

## Team stats and the economy

Every team tracks four stats: money, attention (0 to 100), trust (1 to 10), and risk points. Score is net money gained, final money minus starting money plus any finish prize, and teams are ranked only against teams in the same role.

Attention moves fast. Each round a team gains its profile's base attention plus any gains from contracts and events, and at the end of the round it loses a quarter of its attention, rounded down. Trust moves slowly and never decays; it changes only through events, backlash, repeated partnerships, and influencers holding two contracts.

Money comes mainly from payday spaces, which pay out when a piece lands on or passes them. Brands and influencers use the same formula:

```latex
\text{Payday} = \text{Attention} \times \text{Trust} \times \$100
```

A brand under contract gains half its influencer's current attention each round, or all of it when the influencer's tag matches that round's trend. An influencer under contract gains 3 attention per round on top of the fee. An influencer may hold two contracts at once, at a cost of 1 trust per round while both run.

The numbers are set so deals matter. A Heritage brand with no influencer settles near 9 attention and earns about $7,200 per payday; signed to an influencer near 30 attention, it settles near 54 and earns about $43,000. In simulation, a two-round contract still paid off for the brand at a fee of $16,000, the highest fee tested, while a payday of $50 put the break-even fee near $9,000.

Viral Path is a race. The first team to reach the finish, brand or influencer, wins a $1,000,000 prize; if no team finishes, the prize goes to the piece furthest along. Teams that finish in the same phase are ordered by how many spaces of movement they had left. The prize is far larger than any payday, so in simulation the furthest team in a role won that role 69% of the time in six rounds and 89% in eight. The rest of each role's ranking comes from paydays and fees.

A single prize for the whole class is deliberate. In simulation, paying $1,000,000 to the first finisher in each role, or paying every team by its finishing place, let the dice decide most games, with a correlation between a team's roll total and its rank of 0.49 to 0.71. With one prize the correlation is 0.27.

Rankings stay within each role because fees move money directly from brands to influencers. In simulation, how hard the bots bid decided which role finished ahead on a shared board, so a shared ranking would mostly measure bidding.

## The board

The classroom path is 36 spaces long on the quiet routes and 32 on the viral routes. Each viral route is shorter and passes more event spaces, at a cost of 1 risk point on entry.

&#91;embedded content: classroom board · 36 spaces on quiet routes, 32 on viral routes\]

| Segment | Spaces | Sequence |
| --- | --- | --- |
| Trunk | 1 to 8 | Deal, Feed, Event, Talent, Feed, Payday, Deal, Fork |
| Fork 1, quiet | 6 | Feed, Talent, Deal, Payday, Feed, Deal |
| Fork 1, viral | 4 | Event, Deal, Event, Payday |
| Trunk | 15 to 20 | Deal, Event, Talent, Payday, Feed, Fork |
| Fork 2, quiet | 4 | Deal, Feed, Talent, Feed |
| Fork 2, viral | 2 | Event, Event |
| Trunk | 25 to 36 | Deal, Feed, Event, Talent, Feed, Deal, Feed, Feed, Event, Deal, Feed, Finish |

A feed space has no effect beyond the round's base attention. A deal space lets a brand offer to any influencer on the board that round, and a talent space holds an NPC influencer when the fill rule activates one.

Event spaces enter the round's event draw. A payday pays out when a piece lands on or passes it, and the finish counts as the fourth payday on either route. Each payday pays a piece only once, so a piece that slides back and passes it again earns nothing more.

Pieces move by the roll and also by the choices in the reaction window (see "Events and the reaction window"), so the board was lengthened from 32 to 36 spaces. In simulation, some team reached the finish in about 50% of six-round games and 99% of eight-round games, with about 3.3 of 6 teams finishing in eight. On the original 26-space path, a team finished in 97% of six-round games.

## Round sequence and timers

A round lasts about two minutes, and the app controls every phase with a visible timer. Each team makes only a few decisions per round, and in some rounds only one.

| Clock | Phase | Duration | What happens |
| --- | --- | --- | --- |
| 0:00 | Roll and move | 10 s | The app rolls for every team at once, all pieces move, paydays credit, and the risk check resolves; a backlash slides its piece back |
| 0:10 | Trend reveal | 5 s | One tag (Humor, Food, Fitness, or Value) is trending this round |
| 0:15 | Deal window | 60 s | Brands offer, influencers accept, any team buys down risk; the last 15 s are the final call |
| 1:15 | Contract reveal | 5 s | Selections flip at once on the main screen, and each brand learns whether it was selected |
| 1:20 | Event and reaction | 30 s | One event card resolves; the target responds and other teams react or stay out |
| 1:50 | Resolution | 15 s | Attention gains and contract effects apply, attention decays, the leaderboard updates |

Fork choices are made in the deal window of the round before a piece could reach the fork. A team that makes no choice takes the quiet route.

The instructor can pause, skip a phase, or extend the game from six rounds to eight when round six ends.

## Deals, multiple offers, and the final call

A contract is a fee paid by a brand to an influencer for two rounds. During the deal window, a brand may offer to any influencer within 4 spaces of its piece; a brand standing on a deal space may offer to any influencer on the board that round. Brands and influencers may each hold up to two contracts, and a brand's offers are limited by its money.

An influencer may receive several offers in one deal window and sees them side by side before choosing. When an influencer holds more than one offer, every brand that offered gets a notice that the influencer is considering multiple offers. The notice names neither the other brands nor their amounts.

During the final call, the last 15 seconds of the deal window, each notified brand may raise its offer once. The influencer then selects up to two offers, and the rest lapse. At the reveal, selections flip at once on the main screen and fees are paid. Every brand gets a notice saying whether it was selected.

Repeated partnerships pay off. When a brand and an influencer sign again after a contract ends, both gain 1 trust, up to the maximum of 10.

A signed contract runs its full two rounds; no one can walk away from one. An open offer reserves its fee from the brand's money until the reveal, so a brand cannot promise more than it holds, and an offer that is not selected costs the brand nothing beyond the round.

## Risk and the roll

One roll per team per round decides both movement and the risk check. The die is a standard six-sided die, which averages 3.5 spaces per roll.

A backlash hits when a team's risk points exceed its roll. The team loses 1 trust and 10 attention, its piece slides back 3 spaces, and its risk drops by 2, to a minimum of 0. A piece that has finished is safe from backlash.

| Risk points | Chance of backlash |
| --- | --- |
| 1 or fewer | 0% |
| 2 | 17% |
| 3 | 33% |
| 4 | 50% |
| 5 | 67% |
| 6 | 83% |
| 7 or more | 100% |

| Risk source | Risk added |
| --- | --- |
| Critiquing another team's flop | +2 |
| Leaning in after your own flop | +1 |
| Joining an open event | +1 |
| Entering a viral route at a fork | +1 |
| A brand signing an influencer with trust 3 or lower | +1 |

Any team may buy down risk during the deal window, at $12,000 per point for brands and $4,000 per point for influencers. Risk persists between rounds until it is bought down or a backlash removes it.

The prices are high on purpose. At $3,000 and $1,000, buying risk down early was always the best move in simulation, so it was never a real choice. At these prices a brand weighs one point of risk against most of an $8,000 contract, and an influencer can afford about one point, and no buying habit (buying at 2, 3, 4, or 5 risk, or never) won more than about 10% more often than another.

## Events and the reaction window

One event per round gets a full 30-second reaction window. It goes to the team with the lowest roll among those landing on event spaces, with ties broken at random, and the card drawn matches that team's role. If no team lands on an event space, an open event is drawn instead.

Other teams that land on event spaces in the same round resolve a minor event automatically: +5 attention and +1 risk, with no reaction window. Round one is scripted with Tiny Bite against a random brand team, or Missing Disclosure if no team picked brand.

Every card is based on a true story, and its full text (prompts, Learn more context, what really happened, and the source) lives in `event-cards.md`.

| Card | Type | Target | True story | Special rule |
| --- | --- | --- | --- | --- |
| Tiny Bite | Flop | Brand | McDonald's CEO's Big Arch taste test (2026) | A spokesperson tasting video lands badly; scripted for round one |
| Logo Redesign | Flop | Brand | Gap's new logo (2010) | Delete gives no attention at all |
| Launch Ad Backlash | Flop | Brand | Apple's "Crush!" iPad ad or Coca-Cola's AI holiday ad (2024), drawn at random | None |
| Missing Disclosure | Flop | Influencer | Lord & Taylor's undisclosed paid Instagram posts (2015) | The contracted brand takes the same trust change |
| Copy-Paste Caption | Flop | Influencer | Scott Disick posts Bootea's caption instructions (2016) | None |
| Meme Format | Open | Everyone | IHOP's "IHOb" stunt and the "Pancake King" jokes (2018) | Teams may join for +8 attention and +1 risk |
| Algorithm Shift | Open | Everyone | Snapchat's redesign and Kylie Jenner's tweet (2018) | Brands under contract lose 5 attention unless their influencer matches the trend |
| Trend Spike | Open | Influencers | Sherwin-Williams and paint-mixing TikToker Tony Piloseno (2020 to 2022) | Influencers matching the trend gain +10 attention |

On a flop, the target picks a response within the window, and a target that does not respond is treated as Ignore. The trust result depends on the target's trust going in: High is 7 to 10, Mid is 4 to 6, and Low is 1 to 3.

| Response | Attention | Trust at High | Trust at Mid | Trust at Low | Risk | Spaces at High / Mid / Low |
| --- | --- | --- | --- | --- | --- | --- |
| Delete | +7 | −1 | −1 | −1 | 0 | 0 / 0 / 0 |
| Apologize | +10 | 0 | 0 | 0 | −1 | +1 / +1 / +1 |
| Ignore | +15 | 0 | 0 | −1 | 0 | +1 / +1 / 0 |
| Lean in | +25 | +1 | 0 | −2 | +1 | +3 / +1 / −1 |

Movement follows trust, so leaning in moves a High-trust target 3 spaces forward and a Low-trust target 1 space back. In simulation, leaning in at High trust had the best win rate of any response, and leaning in at Low trust had the worst, which reproduces the McDonald's outcome. With fixed step values, Low-trust teams could lean in and still come out ahead.

Every other team, influencers included, chooses Support, Critique, or Stay out in the same window. Critique covers any public commentary at the target's expense, from a serious point to a joke. Support gives +5 attention, no added risk, and 1 space. Critique gives +10 attention, +2 risk, and 2 spaces, and each critiquing team loses 1 trust if the target leaned in at High trust. Joining a Meme Format gives 1 space on top of its attention.

Speed is rewarded on the board. The first team to react, by support or critique, moves forward 2 spaces and the second moves 1; the same applies to the first two teams joining a Meme Format. These speed bonuses add to the spaces from the choice itself. Spaces gained this way credit any payday passed at resolution.

## Self-play mode

Self-play puts one learner against one bot on a 10-space board, and each of its five rounds introduces one mechanic. Timers are off and the learner can pause at any point. Each bot move appears with a one-line caption explaining why it happened.

Spaces 2, 4, 6, 8, and 10 are stop spaces. In self-play a piece always advances to the next stop, whatever the roll, so the learner meets every mechanic once; the roll still decides the risk check. The tutorial says plainly that in class the roll also sets movement.

The bot takes the same role as the learner, and NPC pieces fill the other side.

| Round | Stop | Mechanic | What the learner sees |
| --- | --- | --- | --- |
| 1 | 2 | Deal and final call | A brand learner and the bot both offer to one NPC influencer, the learner gets the multiple-offers notice and may raise once, and the selection notice follows; an influencer learner receives offers from two NPC brands and selects one |
| 2 | 4 | Flop event | The learner is the target, picks a response, and sees the bot critique |
| 3 | 6 | Payday | Attention converts to money at the learner's trust, shown beside the bot's payout |
| 4 | 8 | Open event and risk | Meme Format, followed by a prompt to buy down risk before the roll |
| 5 | 10 | Finish | The $1,000,000 finish prize and the same end summary screen used in class |

The bot follows fixed habits so a learner can anticipate it. It always reacts first to events and buys down risk whenever it holds 4 or more points. It raises its offer whenever it gets the multiple-offers notice. In the tutorial, an NPC influencer holding two offers selects the higher one.

The end screen suggests a second run in the other role, so the learner sees multiple offers from both sides.

## Interface

The game uses two surfaces: a projected main screen that everyone watches, and a phone screen per team for decisions. All game state lives on the main screen, so a team can follow play from the projector alone.

The look is an original confectionery fantasy: a sugar-bright factory world with clashing saturated colors, candy-stripe paths, glossy surfaces, and oversized dials and pipes. It should feel inviting with a slight unease, as though the board might change under the players. Tilted signage and districts that shift hue when an event fires give that unease without making the game hard to read.

The style takes its cue from Willy Wonka but uses none of the book's or films' characters or imagery. All text sits on solid panels so the colors never cost legibility, in both light and dark display modes.

The main screen puts the winding board in the center, divided into themed districts: a launch zone, a trending strip, backlash alley, and a deal district near the finish. Two leaderboards sit on the right, one for brands and one for influencers, each with net money, attention, trust, and deals signed per team, plus arrows for movement since last round. A feed ticker along the bottom shows posts and signings as they happen.

Events interrupt with a full-screen alert and a countdown, then shrink to a corner panel while teams react. The alert names the true story behind the card, and a Learn more button opens its panel: the context that bears on the decision, what the real brand or influencer did, and the source. After resolution, the panel shows what really happened beside the class's choices. A contract appears as a line joining brand and influencer pieces. At the reveal, selections flip as cards at once; lines draw to the brands chosen, and offers not selected fade out.

Each phone has two screens. The deal inbox holds offers sent and received, the selection controls for influencers, the multiple-offers notice and raise button for brands, and risk buy-down. The action screen holds event responses and reactions, along with the fork choice when one is due.

Influencer faces come from a pre-generated pool of about 20 images, enough for seven teams, three NPCs, event cards, and spares. Two sources are under consideration, thispersondoesnotexist.com and thispersonnotexist.org; their current behavior and terms of use still need checking. The images are downloaded once and embedded in the game file, since a published Claude artifact blocks remote images and a live link may return a new face on each load.

Team brand logos are simple generated marks with fictional names. Event cards name the real brands and people behind each true story, so students can connect play to social media history; real names appear as text with a citation, and real logos are not reproduced. Colors are defined for both light and dark display modes.

## End summary and data logging

The game ends on a summary screen per team with one panel for each discussion question, followed by a class-wide reveal. Teams take these numbers into the report-out.

The participation code for credit must be visible to every student at the end. Students in the previous game could not see the final code, so the end screen on every team phone shows it in large type as the first thing on screen, and the main screen shows it beside the class-wide reveal for students sharing a phone.

The code stays on screen until the student closes it, and reopening the join link brings it back. The instructor sets the code at session setup. Self-play shows its own completion code on its end screen when the instructor has set one.

| Question | Panel | How it is computed |
| --- | --- | --- |
| Success or lucky accident | Our flops | For each flop that targeted the team: its trust going in, its response, and the attention and trust it gained or lost |
| Who won the moment | Attention and spaces gained from other teams' events | Sum of attention and board spaces gained by reacting to or joining events where the team was not the target |
| Attention or lasting value | Attention and trust by round | A two-line chart of the team's attention and trust across rounds, beside its net money |

The summary does not report dice luck. In simulation, a team's roll total correlated with its rank within its role at only about 0.1 to 0.2, and a replay with average rolls could not separate dice from other chance effects.

The class-wide reveal shows the real team names behind each handle and a partnership graph of every contract signed and every offer passed over. For each flop event it also lists the target's attention gain beside the combined gain of the teams that reacted.

The engine logs one row per team per round: roll, position, risk before and after the check, backlash, offers made and selected, event role, reaction choice, attention, trust, and money. The log exports as a CSV file for the instructor.

## Open questions for playtesting

All numbers in this spec are starting values. The first playtest should check how often influencers receive more than one offer, since the notice and the single raise matter only when brands compete. If most influencers see one offer per round, a larger trend bonus would push brands toward the same few influencers.

Contract prices need watching in real play. If brands stop signing because student fees run above about $16,000, the NPC fee of $8,000 is the anchor to adjust, since students are likely to price around it.

Timing may be tight with seven teams. A 60-second deal window could be too short for that many negotiations, and one reaction window per round could leave some teams with nothing to do in a round.

The racing values come from a bot simulation (`sim/RESULTS.md`), and bots are not students. Bot bidding is simplified to a flat fee with no bidding war, and only even splits of three brands and three influencers were simulated. Playtesting should check whether students buy down risk at the new prices, and whether Critique's extra space pulls most teams into critiquing every flop. Someone finished in about 50% of simulated six-round games, just under the 55% to 80% target; removing two of the four added spaces would raise that at some cost to the eight-round race. Influencer bots that always critique and lean in won less than their share, so the influencer side may reward caution more than the brand side does. In simulation, decay between 20% and 33% changed attention levels without changing rankings, so a quarter per round stays.

Two items sit outside the rules. The terms of use for both face sources are unconfirmed, and the behavior of NPC pieces in a split such as six brands and one influencer has not been simulated.
