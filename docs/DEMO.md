# PersonaCRM — Demo script

> Stub created in phase P0. Filled in at T+6:00 (phase C4). Each section becomes: the
> exact sentence to say, who drives, what appears on screen, and the fallback if it breaks.

## Cold open

## The problem

## Use-case justification

_One sentence, because "Use-case clarity" is the first criterion on the sheet:_ we chose a
hackathon platform because an organizer's value is technical capability and reliability over
time, so both platform-native activity **and** external context (GitHub) are relevant — which
is exactly why the food-delivery config switches external sources off.

## Live intake

## AI Scout

## Existence check

Beats already proven in `scripts/test_agent.mjs`:

| Ask                                                            | Expected                                                   |
| -------------------------------------------------------------- | ---------------------------------------------------------- |
| Is Shiv Sharma in our database?                                | Two people share the name — asks which one, instantly      |
| Is Aarav Malhotra in our database?                             | Not found. Offers near names, labelled as different people |
| Ananya Iyar                                                    | Resolves to Ananya Iyer, flagged as an approximate match   |
| Does he really know machine learning? _(after Devansh Kapoor)_ | Declares ML; GitHub is 88% JavaScript — the claim gap      |

## Matchmaking

## Generalizability

Open `config/domain.fooddelivery.json` next to `config/domain.hackathon.json`: same engine,
different signals, every external source switched off.

## Fallbacks

- Graph down -> profiles served from `data/profiles/*.json`, rail shows OFFLINE
- LLM down -> stored narratives and deterministic answers (most answers use zero LLM calls)
- Everything down -> `USE_MOCK=1`, fixtures in `backend/mocks/`
