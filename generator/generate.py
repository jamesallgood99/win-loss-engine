"""
Synthetic source data for the Win/Loss Engine demo.

Builds a voice-of-customer corpus for Acme Corp (fictional), which sells Acme Flow,
workflow automation for operations teams. Deals, accounts and outcomes come from the
Full-Funnel Attribution demo (generator/source/acme-deals.json), so the two demos agree.

Six sources:
  crm       closed-won/lost reason picklist + rep note (what the CRM says)
  call      sales-call excerpts (discovery, demo, security review, negotiation)
  winloss   post-decision win/loss interviews (third-party style)
  interview customer interviews (post-sale)
  cab       customer advisory board recordings (quarterly sessions)
  review    public review-site posts from customers

Every excerpt carries the codes a reviewer (Claude, in production) would assign:
theme + polarity + confidence. The generator plants known patterns so the engine can be
checked against an answer key (tests/truth.json):
  - a stated-vs-real gap: reps pick "Price" far more often than buyers cite price
  - theme effects on win rate (exec sponsorship, ERP integration, time to value, ...)
  - trends: security-review losses fall after the SOC 2 Type II report (June 2025);
    AI-agent losses to Relaywork rise through FY26
  - objection responses that work better than others
  - buyer language that Acme's messaging doesn't use
  - an ERP-connector gap that shows up in losses, interviews, CAB votes and reviews

Coding is simulated: tags are the planted truth with realistic reviewer noise.
Usage: python3 generator/generate.py [--seed 7]
"""
import argparse
import json
import math
import os
import random
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
H = 24.0
SOC2_DAY = 212   # SOC 2 Type II report available (early June 2025)

COMPETITORS = [
    dict(id="flowgrid", name="Flowgrid", kind="Legacy BPM suite",
         blurb="Enterprise process suite. Broad, heavy, long implementations."),
    dict(id="tasklane", name="Tasklane", kind="Low-cost no-code tool",
         blurb="Cheap, simple automations for small teams."),
    dict(id="relaywork", name="Relaywork", kind="AI-native agent platform",
         blurb="Autonomous AI agents for back-office work. Fast-rising in 2026."),
    dict(id="status_quo", name="Status quo", kind="Spreadsheets and email",
         blurb="No decision: the buyer kept doing it by hand."),
    dict(id="in_house", name="Built in-house", kind="Internal build",
         blurb="IT built scripts or used existing platform tools."),
]

THEMES = [
    # id, label, group, phase
    ("exec_sponsor", "Executive sponsorship", "Buying process", "presale"),
    ("security_review", "Security & compliance review", "Buying process", "presale"),
    ("erp_integration", "ERP & finance-system integration", "Product", "both"),
    ("time_to_value", "Time to first workflow", "Product", "presale"),
    ("ease_of_use", "Ops teams can build without IT", "Product", "presale"),
    ("ai_agents", "AI agent capabilities", "Product", "both"),
    ("pricing", "Pricing & packaging", "Commercial", "both"),
    ("roi_proof", "Business case & ROI", "Commercial", "presale"),
    ("references", "Peer references", "Buying process", "presale"),
    ("timing_budget", "Timing & budget", "Commercial", "presale"),
    ("support", "Support & onboarding", "Service", "both"),
    ("value_realized", "Value realized", "Outcomes", "postsale"),
    ("analytics_gap", "Reporting & analytics depth", "Product", "postsale"),
    ("audit_trail", "Audit trail & governance", "Product", "postsale"),
    ("mobile", "Mobile approvals", "Product", "postsale"),
]
THEME = {t[0]: t for t in THEMES}

ROLES = {
    "Enterprise": ["VP Operations", "COO", "Director of IT", "CISO", "Director of Finance Ops", "Procurement Lead", "Head of Shared Services"],
    "Mid-market": ["VP Operations", "Director of Operations", "IT Manager", "Controller", "Ops Manager", "CFO"],
    "SMB": ["Operations Manager", "Founder", "Office Manager", "Finance Lead", "COO"],
}
CUSTOMER_ROLES = ["Ops admin", "Operations Manager", "Director of Operations", "Process owner", "Finance Ops Lead", "IT admin"]

TAILS = {
    -1: [""] * 10 + [ " That was really the whole story.", " We told your rep as much.", " By the time it was sorted, the quarter was over.",
         " It came up in every internal meeting.", " That's what killed it.", " Everything else was fine.", " It wasn't close after that.",
         " We'd have needed a workaround, and nobody wanted to own one.", " Finance made that call, not us."],
    -2: [""] * 8 + [ " It comes up in every ops meeting.", " That's the one thing I'd fix.", " We've asked for it a few times.",
         " The rest of the team says the same.", " It's the gap we work around every week."],
    1: [""] * 10 + [ " That's what tipped it.", " Nobody else came close on that.", " It made the internal pitch easy.",
        " That's the part people still bring up.", " It's why we said yes.", " That changed the conversation with finance.", " We noticed it right away."],
}

OPENERS = [""] * 14 + ["Honestly, ", "To be fair, ", "Look, ", "I'll be straight with you: ", "Candidly, ", "For us, ", "The way I see it, ",
            "Truthfully, ", "If I'm honest, ", "So, ", "Yeah, ", "From where I sit, ", "Bottom line, ", "Frankly, ", "In our case, "]

# --------------------------------------------------------------------------
# Phrase banks: (theme, polarity) -> buyer lines. Slots: {comp} {days} {n} {pct}
# Buyer language is planted here ("without IT", "first workflow", "audit trail",
# "month-end close", "our ERP", "approvals", "spreadsheets", "business case").
# --------------------------------------------------------------------------
BUYER = {
    ("exec_sponsor", -1): [
        "we never got our COO in the room, and without her nothing over fifty grand moves",
        "my boss liked it, but nobody above him was going to fight for budget this year",
        "our champion left in the middle of the evaluation and the project lost its owner",
        "it was an ops project with no executive behind it, so it kept slipping down the list",
        "finance asked who owned the outcome and nobody senior raised their hand",
        "the person who brought you in didn't have the authority to sign, and we figured that out too late",
        "leadership never saw it as a priority, it was always the ops team's side project",
    ],
    ("exec_sponsor", 1): [
        "our CFO wanted the month-end close fixed this quarter, so it had air cover from day one",
        "once the COO sat in on the second demo it stopped being a question of if",
        "having our VP sponsor it meant procurement didn't drag",
        "the executive briefing got our leadership aligned on the problem before we talked price",
    ],
    ("security_review", -1): [
        "it sat in security review for two months and the quarter ended",
        "our CISO wanted a SOC 2 Type II report and you didn't have one yet",
        "the security questionnaire went back and forth four times and people lost patience",
        "IT flagged data residency and the whole thing stalled",
        "we couldn't get through vendor risk in time, so we went with what was already approved",
        "infosec wouldn't sign off without an audit report, and that was the end of it",
    ],
    ("security_review", 1): [
        "you sent the SOC 2 report and the security packet before we even asked, which made IT happy",
        "security review took a week, which never happens here",
        "the security answers were ready to go, so vendor risk wasn't a blocker",
    ],
    ("erp_integration", -1): [
        "there's no native connector for our ERP, and that was a dealbreaker for finance",
        "we needed it to post straight into our ERP, and a CSV export isn't an integration",
        "the ERP integration was on your roadmap, but we needed it now",
        "everything we do touches the finance system, and you couldn't write back to it",
        "our approvals have to land in the ERP, and you'd have needed custom work for that",
        "without a real ERP connector it was just another place to retype data",
        "we looked at three workflow automation tools and only {comp} handled the ERP side",
    ],
    ("erp_integration", 1): [
        "the partner-built ERP connector worked on the first try, and your reference customer vouched for it",
        "seeing approvals post into our ERP in the demo sold the finance team",
    ],
    ("time_to_value", 1): [
        "we had our first workflow live in {days} days, which is unheard of for us",
        "the pilot proved it, we automated invoice approvals in the first week",
        "we got the first workflow running before the contract was even countersigned",
        "speed mattered most, we needed something live before month-end close",
        "the other option was a six-month implementation, you were live in two weeks",
        "time to first workflow was the whole decision for us",
    ],
    ("time_to_value", -1): [
        "we were worried about how long the rollout would take with our team stretched thin",
        "the implementation plan looked like it would eat our whole quarter",
        "we didn't have anyone who could own the rollout, so it felt risky",
    ],
    ("ease_of_use", 1): [
        "my ops team could build it themselves, without IT",
        "the person who runs month-end built the approval flow on her own",
        "it's the first tool where we didn't need to file a ticket with IT to change a step",
        "our team built {n} workflows in the trial without help, that told us everything",
        "it replaced a mess of spreadsheets and email threads, and people actually use it",
        "it's actual no-code automation, not no-code until you need IT",
    ],
    ("ease_of_use", -1): [
        "it still felt like something IT would have to own",
        "the builder was more technical than our ops people wanted",
    ],
    ("ai_agents", -1): [
        "{comp} showed us agents that handle the whole invoice exception queue on their own",
        "we wanted AI agents doing the work, not just routing it, and {comp} did that today",
        "the board asked about our AI plan, and {comp} gave us an AI story",
        "your AI features looked like autocomplete next to {comp}'s agents",
        "{comp} let an agent chase approvals and reconcile mismatches, and you didn't have that",
    ],
    ("ai_agents", 1): [
        "we liked that a person approves what the AI suggests, our auditors would never accept fully autonomous agents",
        "human-in-the-loop was the right call for us, the autonomous stuff scared our controller",
    ],
    ("pricing", -1): [
        "per-seat pricing doesn't work when half the people only approve something once a month",
        "{comp} was a third of the price and good enough for what we do",
        "paying for every approver made the math fall apart",
        "the price jumped once we added the finance team as users",
        "we couldn't justify the cost for a team our size",
    ],
    ("pricing", 1): [
        "the usage-based starter plan let us start small without a big commitment",
        "pricing by workflow instead of by seat made it easy to say yes",
    ],
    ("roi_proof", 1): [
        "the ROI calculator gave me the business case I needed for our CFO",
        "we modeled hours saved on month-end close and the payback was under six months",
        "having the numbers laid out made the budget conversation easy",
    ],
    ("roi_proof", -1): [
        "I couldn't build a business case finance would believe",
        "we never quantified the savings, so it looked like a nice-to-have",
    ],
    ("references", 1): [
        "talking to another ops leader who'd rolled it out made the difference",
        "the reference call with a logistics customer answered every question we had",
        "a peer at another company told us it actually works, that mattered more than the demo",
    ],
    ("timing_budget", -1): [
        "budgets froze in Q3 and everything new got pushed",
        "a reorg landed in the middle of the evaluation and the project lost its slot",
        "it wasn't a no, it was a not-this-year",
        "we had an ERP migration going on and couldn't take on another project",
    ],
    ("support", 1): [
        "your onboarding team basically built the first flows with us",
        "support answered within the hour during the pilot, every time",
        "the customer success manager knows our process better than some of our own people",
    ],
    ("support", -1): [
        "onboarding was rushed and we were left to figure out the advanced features ourselves",
        "tickets take days to get a real answer",
    ],
    ("value_realized", 1): [
        "we cut month-end close from nine days to five",
        "we're saving about {n} hours a week on approvals alone",
        "invoice exceptions used to sit for a week, now they're cleared in a day",
        "we retired three spreadsheets and nobody misses them",
        "audit prep went from a scramble to an export",
    ],
    ("analytics_gap", -1): [
        "reporting is thin, I can't show leadership cycle times by team",
        "I export everything to a spreadsheet to build the dashboards I need",
        "we need analytics on bottlenecks, not just a list of workflow runs",
        "I'd pay for better reporting tomorrow",
    ],
    ("audit_trail", -1): [
        "our auditors want a full audit trail of who changed what, and it's hard to pull",
        "governance is the gap, we need version history on workflows",
        "the audit trail exists but nobody outside ops can read it",
    ],
    ("audit_trail", 1): [
        "the audit trail saved us during our last audit",
    ],
    ("mobile", -1): [
        "managers want to approve from their phones and the mobile experience is clunky",
        "approvals stall when people travel because mobile is so limited",
    ],
}
# Customer-side ERP and AI lines
BUYER[("erp_integration", -2)] = [
    "the number one thing we need is a native ERP connector, we still rekey data",
    "if it wrote back to our ERP we'd roll it out to two more departments",
    "the ERP sync is the gap, everything else works",
]
BUYER[("ai_agents", -2)] = [
    "we'd love agents that draft the exception responses, as long as a person approves",
    "AI that suggests the next step would save us real time",
]
BUYER[("pricing", -2)] = [
    "the renewal quote assumed every approver is a full seat, that's going to be a hard conversation",
    "we're keeping occasional approvers off the platform to save on seats",
]

# Rep objection responses: (theme) -> {approach_id: (label, effective, lines)}
RESPONSES = {
    "security_review": {
        "packet_first": ("Sent SOC 2 report and security packet in week one", True, [
            "I'll send our SOC 2 Type II report and the full security packet today so IT can start in parallel.",
            "Let's get your security team the audit report now, before the technical evaluation wraps.",
        ]),
        "after_tech_win": ("Started security review after the technical win", False, [
            "Let's finish the technical evaluation first and loop in security once you've picked us.",
            "Security usually goes quickly at the end, so let's focus on the use case for now.",
        ]),
    },
    "erp_integration": {
        "partner_connector": ("Offered a partner-built connector plus a reference customer", True, [
            "Our integration partner has built this exact connector three times. I can put you in touch with a customer running it.",
            "There's a partner-built connector live at a customer your size. Want to talk to them this week?",
        ]),
        "roadmap": ("Pointed to the integration roadmap", False, [
            "Native ERP sync is on the roadmap for later this year.",
            "That connector is coming, it's one of our top roadmap items.",
        ]),
    },
    "exec_sponsor": {
        "exec_briefing": ("Ran an executive ROI briefing with the ROI calculator", True, [
            "Can we get thirty minutes with your COO? I'll bring the ROI model with your numbers in it.",
            "Let's walk your CFO through the payback model before we talk paper.",
        ]),
        "champion_sells": ("Left it to the champion to sell internally", False, [
            "I'll send you a deck you can share with leadership.",
            "If you can socialize it internally, we can pick up after your planning cycle.",
        ]),
    },
    "ai_agents": {
        "governed_ai": ("Positioned human-in-the-loop AI and auditability", True, [
            "Our AI suggests the next step and a person approves it, which keeps your auditors happy.",
            "We let AI draft and route, and every action stays in the audit trail with a human sign-off.",
        ]),
        "agents_roadmap": ("Promised autonomous agents on the roadmap", False, [
            "We'll have autonomous agents too, they're on the roadmap.",
            "Agents are coming next year, so you won't be behind.",
        ]),
    },
    "pricing": {
        "usage_tier": ("Offered usage-based starter pricing", True, [
            "We can start you on usage-based pricing so occasional approvers don't count as seats.",
            "Let's price by workflow for the first year and true up later.",
        ]),
        "seat_discount": ("Discounted the per-seat price", False, [
            "I can get you 15% off the per-seat price if we sign this month.",
            "Let me see what discount I can get on the seats.",
        ]),
    },
}

REP_NOTES = {
    "Price": ["Came down to price. They felt we were over budget.", "Lost on price, {comp} came in lower.", "Budget too tight for our quote.", "Price objection we couldn't overcome."],
    "Lost to competitor": ["Went with {comp}.", "Chose {comp}, felt they were a better fit.", "{comp} won the bake-off."],
    "No decision / timing": ["Went dark after the demo.", "Project deprioritized.", "Not this year, will revisit.", "Stalled, no next steps."],
    "Missing feature": ["Missing a feature they needed.", "Feature gap.", "Needed functionality we don't have yet."],
    "Other": ["Lost, unclear why.", "Closed lost."],
    "Product fit": ["Great fit for their ops team.", "Strong product fit.", "Use case lined up perfectly."],
    "Relationship": ["Champion pushed it through.", "Strong relationship with the VP."],
    "Speed to value": ["Pilot went live fast and sold itself.", "Won on time to value."],
    "Price (won)": ["Competitive on price.", "Won on pricing flexibility."],
}

MESSAGING = ["end-to-end orchestration", "hyperautomation", "single pane of glass", "enterprise-grade governance",
             "AI-powered workflows", "intelligent automation", "no-code automation", "digital transformation",
             "time to value", "workflow automation"]


def wchoice(rng, d):
    items = [(k, v) for k, v in d.items() if v > 0]
    r = rng.random() * sum(v for _, v in items)
    for k, v in items:
        r -= v
        if r <= 0:
            return k
    return items[-1][0]


class Gen:
    def __init__(self, seed):
        self.rng = random.Random(seed)
        self.snips = []
        self.truth = dict(deals={}, objection_effects={}, notes=[])

    def line(self, theme, pol, **slots):
        rng = self.rng
        txt = rng.choice(BUYER[(theme, pol)])
        slots.setdefault("days", rng.choice([4, 5, 6, 8, 9, 10, 12]))
        slots.setdefault("n", rng.choice([6, 8, 11, 12, 15, 20, 30]))
        slots.setdefault("comp", "the other vendor")
        slots.setdefault("pct", rng.choice([20, 30, 40]))
        txt = txt.format(**slots)
        if not txt.endswith((".", "?", "!")):
            txt += "."
        txt += rng.choice(TAILS[pol if pol in TAILS else (1 if pol > 0 else -1)])
        op = rng.choice(OPENERS)
        txt = (op + txt) if op else txt
        txt = txt[0].upper() + txt[1:]
        if not txt.endswith((".", "?", "!")):
            txt += "."
        return txt

    def code(self, theme, pol, conf_lo=0.72):
        """Simulated reviewer tagging: mostly the truth, sometimes a near miss."""
        rng = self.rng
        conf = round(rng.uniform(conf_lo, 0.98), 2)
        if rng.random() < 0.05:
            near = {"exec_sponsor": "timing_budget", "timing_budget": "exec_sponsor", "security_review": "timing_budget",
                    "time_to_value": "ease_of_use", "ease_of_use": "time_to_value", "roi_proof": "exec_sponsor",
                    "pricing": "roi_proof", "erp_integration": "time_to_value", "ai_agents": "erp_integration",
                    "references": "roi_proof", "support": "time_to_value", "value_realized": "time_to_value",
                    "analytics_gap": "audit_trail", "audit_trail": "analytics_gap", "mobile": "ease_of_use"}
            theme = near.get(theme, theme)
            conf = round(rng.uniform(0.5, 0.7), 2)
        return dict(theme=theme, polarity=1 if pol > 0 else -1, confidence=conf)

    def add(self, **kw):
        kw["id"] = f"s{len(self.snips) + 1:05d}"
        self.snips.append(kw)
        return kw

    # ------------------------------------------------------------------
    def run(self, src):
        rng = self.rng
        accts = {a["id"]: a for a in src["accounts"]}
        deals_out = []
        comp_name = {c["id"]: c["name"] for c in COMPETITORS}
        for d in sorted(src["closed_new_business"], key=lambda x: x["closed"]):
            a = accts[d["account"]]
            tier = a["tier"]
            won = d["status"] == "won"
            day = d["closed"] / H
            fy26 = day >= 365
            # competitor
            if tier == "Enterprise":
                mix = dict(flowgrid=0.42, relaywork=0.33 if fy26 else 0.17, status_quo=0.25, in_house=0.12)
            elif tier == "Mid-market":
                mix = dict(flowgrid=0.22, tasklane=0.2, relaywork=0.36 if fy26 else 0.16, status_quo=0.3, in_house=0.05)
            else:
                mix = dict(tasklane=0.45, relaywork=0.2 if fy26 else 0.08, status_quo=0.4)
            comp = wchoice(rng, mix)
            # true primary driver
            if won:
                drv = wchoice(rng, dict(time_to_value=0.28, ease_of_use=0.2, roi_proof=0.15, references=0.1,
                                        exec_sponsor=0.14, support=0.08, security_review=0.05 if day >= SOC2_DAY else 0.0))
                pol = 1
            else:
                mix = dict(exec_sponsor=0.24, security_review=0.34 if day < SOC2_DAY else 0.06, erp_integration=0.17,
                           ai_agents=(0.32 if comp == "relaywork" else 0.03) * (1.4 if fy26 else 0.8),
                           pricing=0.28 if tier == "SMB" else (0.1 if tier == "Mid-market" else 0.04),
                           time_to_value=0.07, timing_budget=0.22 if comp == "status_quo" else 0.06)
                if comp == "tasklane":
                    mix["pricing"] += 0.25
                drv = wchoice(rng, mix)
                pol = -1
            # secondary themes (present with outcome-conditioned rates => measurable effects)
            sec = []
            base = {  # P(theme mentioned, polarity) given won / lost
                ("exec_sponsor", -1): (0.06, 0.3), ("exec_sponsor", 1): (0.3, 0.06),
                ("erp_integration", -1): (0.1, 0.32), ("security_review", -1): (0.08, 0.2),
                ("time_to_value", 1): (0.55, 0.12), ("ease_of_use", 1): (0.45, 0.2),
                ("roi_proof", 1): (0.3, 0.08), ("references", 1): (0.22, 0.05),
                ("pricing", -1): (0.25, 0.42),  # price comes up everywhere: weak signal
                ("support", 1): (0.2, 0.08), ("ai_agents", -1): (0.04, 0.12 if fy26 else 0.05),
            }
            for (th, p), (pw, pl) in base.items():
                if th == drv:
                    continue
                if th == "security_review" and day >= SOC2_DAY:
                    pw, pl = pw * 0.5, pl * 0.4
                if rng.random() < (pw if won else pl):
                    sec.append((th, p))
            themes = [(drv, pol)] + sec[:3]
            # CRM stated reason
            if won:
                crm = wchoice(rng, {"Product fit": 0.45, "Relationship": 0.2, "Speed to value": 0.2, "Price (won)": 0.15})
            else:
                crm = wchoice(rng, {
                    "pricing": {"Price": 0.85, "Lost to competitor": 0.1, "Other": 0.05},
                    "exec_sponsor": {"Price": 0.42, "No decision / timing": 0.38, "Lost to competitor": 0.12, "Other": 0.08},
                    "security_review": {"Price": 0.3, "No decision / timing": 0.4, "Lost to competitor": 0.15, "Missing feature": 0.1, "Other": 0.05},
                    "erp_integration": {"Missing feature": 0.4, "Price": 0.3, "Lost to competitor": 0.25, "Other": 0.05},
                    "ai_agents": {"Lost to competitor": 0.6, "Missing feature": 0.2, "Price": 0.2},
                    "timing_budget": {"No decision / timing": 0.6, "Price": 0.3, "Other": 0.1},
                    "time_to_value": {"Price": 0.4, "Lost to competitor": 0.35, "No decision / timing": 0.25},
                }[drv])
            stage_lost = None if won else wchoice(rng, {"Discovery": 0.15, "Demo / evaluation": 0.35, "Security & procurement": 0.2 if drv == "security_review" else 0.08, "Negotiation": 0.3})
            if not won and drv == "security_review":
                stage_lost = "Security & procurement"
            deal = dict(id=d["id"], account=a["id"], account_name=a["name"], tier=tier, industry=a["industry"],
                        amount=d["amount"], outcome="won" if won else "lost", created=d["created"], closed=d["closed"],
                        competitor=comp, crm_reason=crm.replace(" (won)", ""), stage_lost=stage_lost)
            deals_out.append(deal)
            self.truth["deals"][d["id"]] = dict(primary=drv, polarity=pol, themes=themes)
            cslots = dict(comp=comp_name[comp] if comp not in ("status_quo", "in_house") else "the other option")
            # CRM record
            note = rng.choice(REP_NOTES[crm]).format(comp=comp_name.get(comp, "a competitor"))
            self.add(deal=d["id"], account=a["id"], source="crm", t=d["closed"], speaker="Acme AE", speaker_side="acme",
                     text=f"Closed {'won' if won else 'lost'}. Reason: {deal['crm_reason']}. {note}", codes=[], stated_reason=deal["crm_reason"])
            # Sales-call excerpts
            span = max(d["closed"] - d["created"], 48)
            roles = ROLES[tier]
            mentioned = themes if rng.random() < 0.9 else themes[1:]
            for th, p in mentioned:
                if (th, p) not in BUYER:
                    continue
                if rng.random() < (0.85 if th == drv else 0.7):
                    t = d["created"] + rng.uniform(0.1, 0.95) * span
                    call = rng.choice(["Discovery call", "Demo", "Technical evaluation", "Security review", "Pricing discussion", "Check-in"])
                    if th == "security_review":
                        call = "Security review"
                    if th == "pricing":
                        call = "Pricing discussion"
                    self.add(deal=d["id"], account=a["id"], source="call", t=round(t, 1), meeting=call,
                             speaker=rng.choice(roles), speaker_side="buyer", text=self.line(th, p, **cslots), codes=[self.code(th, p)])
            # Objection handling (rep lines) for objection themes present as negatives
            for th, p in themes:
                if th in RESPONSES and (p < 0 or th == "pricing"):
                    if rng.random() > 0.8:
                        continue
                    opts = RESPONSES[th]
                    good = [k for k, v in opts.items() if v[1]][0]
                    bad = [k for k, v in opts.items() if not v[1]][0]
                    # effective approach is more common among won deals (planted effect)
                    p_good = 0.7 if won else 0.3
                    if th == "security_review" and day >= SOC2_DAY:
                        p_good += 0.15
                    ap = good if rng.random() < min(p_good, 0.92) else bad
                    t = d["created"] + rng.uniform(0.2, 0.9) * span
                    self.add(deal=d["id"], account=a["id"], source="call", t=round(t, 1), meeting="Objection handling",
                             speaker=rng.choice(["Acme AE", "Acme solutions engineer"]), speaker_side="acme",
                             text=rng.choice(opts[ap][2]), codes=[], response=dict(objection=th, approach=ap))
            # Win/loss interview (more often for losses and larger deals)
            if rng.random() < (0.5 if not won else 0.35) + (0.1 if tier == "Enterprise" else 0):
                t = d["closed"] + rng.uniform(10, 30) * H
                role = rng.choice(roles)
                q1 = "What was the main reason you chose " + ("Acme Flow?" if won else ("to stay with your current process?" if comp == "status_quo" else "another option?"))
                ans = self.line(drv, pol, **cslots)
                if not won and crm == "Price" and drv != "pricing":
                    pre = rng.choice(["Price wasn't really it. ", "It wasn't the price. ", "Your rep probably logged it as price, but ", "Cost came up, but it wasn't the reason. "])
                    ans = pre + ((ans[0].lower() + ans[1:]) if pre.endswith("but ") else ans)
                self.add(deal=d["id"], account=a["id"], source="winloss", t=round(t, 1), question=q1, speaker=role,
                         speaker_side="buyer", text=ans, codes=[self.code(drv, pol, 0.82)], primary=True)
                for th, p in sec[:2]:
                    if (th, p) in BUYER and rng.random() < 0.7:
                        self.add(deal=d["id"], account=a["id"], source="winloss", t=round(t, 1), question="What else shaped the decision?",
                                 speaker=role, speaker_side="buyer", text=self.line(th, p, **cslots), codes=[self.code(th, p)])
        self.deals = deals_out
        self.customers(src, accts)
        self.cab(src, accts)
        self.reviews(src, accts)

    # ------------------------------------------------------------------
    def customers(self, src, accts):
        rng = self.rng
        churned = {r["parent"] for r in src["renewals"] if r["status"] == "lost"}
        renewed = {r["parent"] for r in src["renewals"] if r["status"] == "won"}
        cust = src["customers"]
        self.interviews = []
        picks = rng.sample(cust, min(110, len(cust)))
        for c in picks:
            a = accts[c["account"]]
            t0 = max(c["closed"], 0) + rng.uniform(60, 300) * H
            if t0 / H > 728:
                continue
            churn = c["id"] in churned
            iv = dict(id=f"iv{len(self.interviews) + 1:03d}", account=a["id"], account_name=a["name"], tier=a["tier"], t=round(t0, 1),
                      renewal="churned" if churn else ("renewed" if c["id"] in renewed else "not yet up"))
            self.interviews.append(iv)
            role = rng.choice(CUSTOMER_ROLES)
            plan = [("value_realized", 1, 0.55 if churn else 0.85), ("analytics_gap", -1, 0.55 if churn else 0.35),
                    ("erp_integration", -2, 0.45), ("audit_trail", -1, 0.25), ("mobile", -1, 0.2),
                    ("support", -1, 0.4 if churn else 0.12), ("support", 1, 0.15 if churn else 0.35),
                    ("pricing", -2, 0.35 if churn else 0.12), ("ai_agents", -2, 0.2)]
            for th, p, pr in plan:
                if rng.random() < pr:
                    self.add(interview=iv["id"], account=a["id"], source="interview", t=iv["t"], speaker=role, speaker_side="customer",
                             text=self.line(th, p), codes=[self.code(th, p)])

    def cab(self, src, accts):
        rng = self.rng
        cust_accts = list({c["account"] for c in src["customers"]})
        self.cab_sessions = []
        asks = ["erp_integration", "analytics_gap", "audit_trail", "mobile", "ai_agents"]
        weights = {"erp_integration": 1.0, "analytics_gap": 0.75, "audit_trail": 0.45, "mobile": 0.3, "ai_agents": 0.35}
        for q, (label, day) in enumerate([("Q1 FY25", 75), ("Q2 FY25", 165), ("Q3 FY25", 255), ("Q4 FY25", 345),
                                          ("Q1 FY26", 440), ("Q2 FY26", 530), ("Q3 FY26", 620), ("Q4 FY26", 705)]):
            members = rng.sample(cust_accts, 8)
            w = dict(weights)
            w["ai_agents"] *= 1.0 + q * 0.25          # rising interest in AI
            votes = Counter()
            for m in members:
                for _ in range(3):
                    votes[wchoice(rng, w)] += 1
            sess = dict(id=f"cab{q + 1}", label=f"Customer Advisory Board, {label}", t=round(day * H, 1),
                        members=[accts[m]["name"] for m in members], votes=dict(votes))
            self.cab_sessions.append(sess)
            for m in members:
                th = wchoice(rng, w)
                pol = -2 if (th, -2) in BUYER else -1
                self.add(cab=sess["id"], account=m, source="cab", t=sess["t"], speaker=rng.choice(CUSTOMER_ROLES), speaker_side="customer",
                         text=self.line(th, pol), codes=[self.code(th, pol)])
                if rng.random() < 0.5:
                    self.add(cab=sess["id"], account=m, source="cab", t=sess["t"], speaker=rng.choice(CUSTOMER_ROLES), speaker_side="customer",
                             text=self.line("value_realized", 1), codes=[self.code("value_realized", 1)])

    def reviews(self, src, accts):
        rng = self.rng
        self.review_posts = []
        cust = src["customers"]
        titles_pos = ["Finally off spreadsheets", "Ops team loves it", "Fast to set up", "Great for approvals", "Month-end is calmer"]
        titles_neg = ["Good core, missing pieces", "Needs a real ERP connector", "Reporting is weak", "Pricey as you grow"]
        for c in rng.sample(cust, min(150, len(cust))):
            a = accts[c["account"]]
            t = max(c["closed"], 0) + rng.uniform(30, 400) * H
            if t / H > 729:
                continue
            pros = [("ease_of_use", 1), ("time_to_value", 1), ("value_realized", 1), ("support", 1)]
            cons = [("erp_integration", -2), ("analytics_gap", -1), ("pricing", -2), ("mobile", -1), ("audit_trail", -1)]
            p = rng.sample(pros, rng.randint(1, 2))
            cn = [x for x in cons if rng.random() < {"erp_integration": 0.4, "analytics_gap": 0.35, "pricing": 0.22, "mobile": 0.18, "audit_trail": 0.15}[x[0]]]
            stars = max(2, min(5, round(4.6 - 0.45 * len(cn) + rng.uniform(-0.4, 0.4))))
            rid = f"rv{len(self.review_posts) + 1:03d}"
            self.review_posts.append(dict(id=rid, account=a["id"], tier=a["tier"], industry=a["industry"], t=round(t, 1), stars=stars,
                                          title=rng.choice(titles_neg if cn and stars <= 3 else titles_pos)))
            for th, pol in p:
                self.add(review=rid, account=a["id"], source="review", t=round(t, 1), speaker=f"{rng.choice(CUSTOMER_ROLES)}, {a['industry']}",
                         speaker_side="customer", text=self.line(th, pol), codes=[self.code(th, pol)], part="pros")
            for th, pol in cn:
                self.add(review=rid, account=a["id"], source="review", t=round(t, 1), speaker=f"{rng.choice(CUSTOMER_ROLES)}, {a['industry']}",
                         speaker_side="customer", text=self.line(th, pol), codes=[self.code(th, pol)], part="cons")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--out", default=os.path.join(HERE, "..", "docs", "data", "corpus.json"))
    args = ap.parse_args()
    src = json.load(open(os.path.join(HERE, "source", "acme-deals.json")))
    g = Gen(args.seed)
    g.run(src)
    for s in g.snips:  # polarity -2 marks customer requests in the phrase bank; codes already normalized
        s["t"] = round(s["t"], 1)
    corpus = dict(
        schema="wle/1",
        meta=dict(company="Acme Corp", product="Acme Flow", epoch=src["epoch"], days=src["days"], soc2_day=SOC2_DAY,
                  description="Synthetic demo corpus. Acme Corp, its customers and competitors are fictional.",
                  generated_with=f"generator/generate.py --seed {args.seed}"),
        sources=[dict(id="crm", label="CRM reason & rep note"), dict(id="call", label="Sales call"),
                 dict(id="winloss", label="Win/loss interview"), dict(id="interview", label="Customer interview"),
                 dict(id="cab", label="CAB recording"), dict(id="review", label="Review")],
        themes=[dict(id=t[0], label=t[1], group=t[2], phase=t[3]) for t in THEMES],
        competitors=COMPETITORS,
        responses={th: [dict(id=k, label=v[0]) for k, v in opts.items()] for th, opts in RESPONSES.items()},
        messaging=MESSAGING,
        deals=g.deals, interviews=g.interviews, cab_sessions=g.cab_sessions, reviews=g.review_posts,
        renewals=[dict(parent=r["parent"], account=r["account"], status=r["status"], t=r["closed"]) for r in src["renewals"]],
        snippets=g.snips,
    )
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    json.dump(corpus, open(args.out, "w"), separators=(",", ":"))
    truth = dict(g.truth)
    truth["objection_effects"] = {th: [k for k, v in o.items() if v[1]][0] for th, o in RESPONSES.items()}
    truth["planted"] = dict(stated_vs_real="CRM 'Price' greatly overstates pricing as the real loss driver",
                            soc2_day=SOC2_DAY, rising="ai_agents (Relaywork) in FY26", falling="security_review after SOC 2",
                            cross_source_gap="erp_integration", buyer_phrases=["without it", "first workflow", "audit trail", "month-end close", "our erp", "business case"])
    tdir = os.path.join(HERE, "..", "tests")
    os.makedirs(tdir, exist_ok=True)
    json.dump(truth, open(os.path.join(tdir, "truth.json"), "w"), indent=1)
    by = Counter(s["source"] for s in g.snips)
    lost = [d for d in g.deals if d["outcome"] == "lost"]
    print(f"deals {len(g.deals)} (won {len(g.deals) - len(lost)}, lost {len(lost)})  snippets {len(g.snips)} {dict(by)}")
    print("CRM reasons (lost):", Counter(d["crm_reason"] for d in lost).most_common())
    print("True drivers (lost):", Counter(g.truth["deals"][d["id"]]["primary"] for d in lost).most_common())
    print("Competitors:", Counter(d["competitor"] for d in g.deals).most_common())
    print(f"interviews {len(g.interviews)}  cab {len(g.cab_sessions)}  reviews {len(g.review_posts)}  size {os.path.getsize(args.out) / 1e6:.2f} MB")


if __name__ == "__main__":
    main()
