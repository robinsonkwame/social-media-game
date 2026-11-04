# social-media-game

**Viral Path**, the TISA3630 social media game. Brand and influencer teams race
along a candy-village board to a $50,000 finish, sign deals, and react to
real social media flops. Each event card cites the true story behind it.

- `Viral Path Social Media Campaign Game, Design Specification.md`: the rules
- `event-cards.md`: the true stories, prompts and sources behind every card
- `sim/RESULTS.md`: the balance simulation that set the numbers

## Pages

| Page | Who | What it does |
|---|---|---|
| `/host` | the teacher | Controls on the left; the projected board, event panel and leaderboards on the right. You decide when to roll, when deals close, and when the next event fires. You can also join a team yourself. |
| `/` | each team, on a phone | Join with a team name and profile, then follow the round: deals, final call, timed reactions with **Learn more**, and the participation code at the end. |
| `/solo` | anyone | Practice: one team against five bots on the same rules, with you pressing the teacher's buttons. Pick the die before you start; **Restart** (click twice) starts over. Runs in the browser; a reload picks up where you left off. |

### Running a round from `/host`

1. **Roll the dice**: every team rolls at once and moves (1–3 by default; pick 1–4, 1–5 or 1–6 under **Dice**), a separate 1–6 risk check runs, and the trend is revealed. The deal window opens.
2. **Start the final call**: buy-downs and road choices apply; influencers see their offers; brands with competition may raise once.
3. **Close deals**: contracts are signed.
4. **Show the next event**: a true-story card appears on every screen with the story open and no clock, so teams can read it. Everyone already knows from the deal window whether it's a flop aimed at one team (it landed on an Event space with the lowest roll) or an event that affects everyone. Cards with no choices (Algorithm Shift, Trend Spike) just need **Apply the event**.
5. **Start the countdown**: choices open on every phone, and the projector lists who has locked in. Each team's first tap is final. The countdown is 60 seconds by default; set it under **Reaction countdown**, and press **+15 seconds** if the class needs longer.
6. **Close the event and score it**: choices and movement apply, the round ends, and everyone sees what really happened.
7. **Start the next round**, or after round 6 **Extend to 8 rounds** or **Finish the game**.

Set the participation code in the lobby; every phone shows it at the end.
With the 1–3 die, pieces usually get about halfway in six rounds, so the finish prize normally goes to the piece furthest along. Pick a bigger die if you want teams to reach the castle.
Leaderboards show **Cash** (money on hand, never below $0), **Profit** (the score: money made or lost since the start, so it goes negative after spending) and **Trust** with its change since the start (for example `8 +1`).
**+ Bot brand / + Bot influencer / Even the sides** add computer teams when one side is short.
**Download CSV** exports one row per team per round.
The finish prize is `prize` in `public/js/rules.js`; change it there and every screen, the board and the leaderboards follow.
Underlined game words (Cash, Profit, Attention, Trust, Risk, Space, Payday, Deals, Trend, Backlash) open a short card: what it is, what raises and lowers it, and whether it helps you win. Edit the text in `GLOSSARY` in `public/js/ui.js`.

## Try it without deploying (simulated mode)

```bash
python3 -m http.server 8787 -d public
```

Adding `?debug=1` once swaps the Netlify backend for a simulator that lives in
your browser's localStorage and syncs across tabs; `?debug=0` turns it off.

- Host: http://localhost:8787/host.html?debug=1
- Player: http://localhost:8787/index.html?debug=1 (or scan the QR on the host page)

## Run the real thing locally

Needs Node 20.12 or newer.

```bash
npm install
cp .env.example .env
npm run dev
```

Edit `.env` and set `HOST_KEY` to a long random string first. `npm run dev`
runs `netlify dev` on http://localhost:8888, with the functions and a local
Netlify Blobs sandbox (stored in `.netlify/`). Open http://localhost:8888/host
and enter the key.

## Deploy

1. Create a Netlify site from this repo (build command: none, publish
   directory: `public`; `netlify.toml` sets both).
2. Site configuration → Environment variables → add `HOST_KEY` (a long random
   secret that unlocks the host page).
3. Open `https://<site>.netlify.app/host`, enter the host key, and project the
   page. Students scan the QR or open the copied join link.

## How the server keeps the game consistent

All game state, teams included, is one `game` blob in the `viral-path` store,
written only by joins and host actions with compare-and-swap. Each team's
choices go to their own key (`g/<game>/acts/<round>/<stage>/<team>`). Before a
host step reads those choices it marks the game as closing, so a choice is
either counted or the phone is told it arrived too late. Phones and the host
poll `/api/state` every 1.5 seconds.

## Tests

```bash
npm test
```

## Credits

Board background: "Candy Village Background" from
[PublicDomainPictures.net](https://www.publicdomainpictures.net/pictures/530000/velka/candy-village-background.jpg),
released under [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/).
No attribution is required; it is credited here as a courtesy.
