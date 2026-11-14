# Win/Loss Engine

Why deals are won and lost, in buyers' own words. The Win/Loss Engine codes every place buyers and customers explain themselves: CRM loss reasons, sales calls, win/loss interviews, customer interviews, customer advisory board recordings and reviews. It turns them into findings a sales, product and marketing team can act on, and every number links back to the quotes behind it.

**Live demo:** https://jamesallgood99.github.io/win-loss-engine/ (add `?tour` for the guided tour)

## What it answers

- **Why do we really lose?** The real reason per deal, taken from the win/loss interview where one exists and inferred from call excerpts where it doesn't.
- **Is the CRM telling the truth?** A stated-vs-real matrix compares the rep's picklist reason with what the buyer said. In the demo, reps log "Price" on 46% of losses; buyers name price on 18%.
- **What moves win rate?** Each theme's effect on win rate, compared within segment and corrected for running many tests.
- **Who do we lose to, and on what?** Win rate, trend and loss reasons against each competitor, with the clearest quote for each.
- **Which objection responses work?** Win rates for the different ways reps answer the same objection.
- **Do buyers talk the way we do?** Phrases buyers and customers repeat, compared with Acme's messaging.
- **What do customers keep asking for?** Gaps ranked by how many sources agree: lost deals, customer interviews, CAB priority votes and reviews. It also flags early churn signals from interviews with customers who later churned.
- **What should we do?** Ranked recommendations, each linked to its quotes, plus a one-click editable PowerPoint readout and a CSV export of the coded evidence.

## How it works

1. **Collect.** Six sources go into one schema (`wle/1`): deals with the CRM's stated reason, and excerpts with source, speaker, date and a link to a deal or account.
2. **Code.** Claude tags each buyer or customer excerpt with up to three themes, each with a polarity (problem or strength) and a confidence score, using `prompts/code-excerpt.md`. Codes below 0.7 confidence go to a person for review, and a person owns the taxonomy. `scripts/code_with_claude.py` runs this over a JSONL file of real excerpts.
3. **Analyze.** `docs/js/engine.js` runs in the browser, with no build step and no server.
4. **Act.** The Actions tab and the deck turn the findings into a plan.

### Statistics

- **Theme impact:** within-segment difference in win rate between deals where buyers raised a theme and deals where they didn't, pooled across segments, with a z-test and Benjamini-Hochberg correction at a 10% false discovery rate.
- **Objection responses:** two-proportion z-test between the two approaches.
- **Cross-source gaps:** the average of four shares (lost deals, interviews, CAB votes, reviews). A source "agrees" at 10% or more.
- **Buyer language:** content-word two- and three-word phrases, counted once per account. Phrases that spread evenly across themes (filler) are dropped, and fragments of the same sentence are collapsed.

## The demo data

`generator/generate.py` (standard library only, seeded) builds a synthetic corpus on top of the same Acme Corp deals used in [Full-Funnel Attribution](https://github.com/jamesallgood99/full-funnel-attribution): 388 closed deals (163 won, 225 lost) and about 2,600 coded excerpts. The source extract is in `generator/source/acme-deals.json`.

The generator plants known patterns, and `tests/engine.test.mjs` checks that the engine finds each one:

| Planted | Found |
|---|---|
| Reps over-log "Price" | CRM 46% vs. buyers 18% |
| Real reason per deal | 97% match when a win/loss interview exists, about 50% from call excerpts alone |
| Missing executive sponsor and ERP gaps lower win rate; fast time to value raises it | All significant, in the right direction |
| Security-review losses fall after the June 2025 SOC 2 report | Yes |
| Losses to Relaywork, an AI-native competitor, rise in FY26 | Yes |
| Usage-based pricing, partner connectors and governed AI beat discounting, roadmap promises and agent promises | Yes, with pricing and ERP significant |
| ERP connector is the gap every source agrees on | 4 of 4 sources |
| Buyers say "month-end close" and "ERP connector"; Acme's messaging says "hyperautomation" | Yes |

Coding is simulated in the demo: tags are the planted truth with realistic reviewer noise (about 1 in 20 lands on a neighboring theme at low confidence). Acme Corp, its customers, buyers, competitors and every quote are fictional.

## Run it locally

```bash
python3 generator/generate.py          # writes docs/data/corpus.json and tests/truth.json
node tests/engine.test.mjs             # checks the engine against the planted patterns
python3 -m http.server 8000 -d docs    # open http://localhost:8000
```

## Project layout

```
generator/generate.py        synthetic Acme Corp corpus (schema wle/1)
generator/source/            deal extract shared with Full-Funnel Attribution
prompts/code-excerpt.md      the coding prompt and taxonomy
scripts/code_with_claude.py  codes real excerpts with Claude
docs/                        the GitHub Pages site
  js/engine.js               drivers, stated vs. real, theme impact, competitors, objections, language, customer voice, recommendations
  js/app.js                  dashboard views and the evidence explorer
  js/deck.js                 leadership deck (.pptx)
  js/tour.js                 guided tour (?tour)
tests/                       engine tests and the generator's answer key
```

## Connections

- Same Acme Corp and the same closed deals as [Full-Funnel Attribution](https://jamesallgood99.github.io/full-funnel-attribution/).
- Buyer language and loss reasons feed personas and messages into the [GTM Simulator](https://jamesallgood99.github.io/gtm-simulator/).
- Competitor findings feed battlecards in the [Competitive Intel Tracker](https://jamesallgood99.github.io/competitive-intel-tracker/).

## License

MIT
