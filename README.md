# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/liming876/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/liming876/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar over a sealed snapshot of 758 DeFi protocols. The protocols that record no token yet are ranked by implied value — TVL × their category's own market multiple (the median market-cap-to-TVL of the snapshot's trading protocols in that category, shrunk toward the snapshot-wide median) × a 7-day growth factor × a maturity factor for years tracked with no token. No name is hardcoded anywhere: every figure is computed from the snapshot alone. The house watchlist of 40 is covered in full, each ranked protocol carries a five-step farm plan with a cost and a time on every step, and every protocol set aside — already trading, or a product of a token that already trades — is listed on the dashboard with its reason. Node standard library only, no network, deterministic: two runs over the same snapshot write the same bytes.

## Run it

```sh
node main.ts --input /path/to/snapshot.json --output ./out
```

Writes `board.json` (the ranked board), `data.js` (the dashboard payload), `dashboard/` and `screenshots/` (copied from this repository) and `dossier.json` into the output directory.

---

<sub>Entered on [make.fun](https://make.fun/?ref=exk3k3jy&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
