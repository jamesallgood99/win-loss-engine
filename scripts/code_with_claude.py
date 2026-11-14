"""
Code real excerpts with Claude into the Win/Loss Engine corpus format.

Input: a JSONL file, one excerpt per line, for example
  {"id": "x1", "source": "winloss", "deal": "D-1042", "account": "A-77", "t": 1234.0,
   "speaker": "VP Operations", "speaker_side": "buyer",
   "question": "What was the main reason you chose another option?", "text": "..."}

Output: the same records with a "codes" list added, ready to merge into docs/data/corpus.json
as "snippets". Codes with confidence below --review-below are written to a separate
review file for a person to confirm.

Usage:
  pip install anthropic
  export ANTHROPIC_API_KEY=...
  python3 scripts/code_with_claude.py excerpts.jsonl coded.jsonl

Set CLAUDE_MODEL to choose the model (default: claude-sonnet-5-5).
"""
import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PROMPT_FILE = os.path.join(HERE, "..", "prompts", "code-excerpt.md")
VALID = {"exec_sponsor", "security_review", "erp_integration", "time_to_value", "ease_of_use", "ai_agents", "pricing",
         "roi_proof", "references", "timing_budget", "support", "value_realized", "analytics_gap", "audit_trail", "mobile"}


def system_prompt():
    text = open(PROMPT_FILE, encoding="utf-8").read()
    return text.split("---", 1)[1].strip() if "---" in text else text


def code_one(client, model, system, rec):
    user = f"Source: {rec.get('source')}\nSpeaker: {rec.get('speaker', 'unknown')}\n"
    if rec.get("question"):
        user += f"Question asked: {rec['question']}\n"
    user += f"Excerpt:\n{rec['text']}"
    msg = client.messages.create(model=model, max_tokens=400, system=system, messages=[{"role": "user", "content": user}])
    raw = "".join(b.text for b in msg.content if getattr(b, "type", "") == "text").strip()
    raw = raw.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        codes = json.loads(raw).get("codes", [])
    except json.JSONDecodeError:
        return [], f"unparseable response: {raw[:120]}"
    clean = []
    for c in codes[:3]:
        if c.get("theme") not in VALID or c.get("polarity") not in (-1, 1):
            continue
        clean.append({"theme": c["theme"], "polarity": c["polarity"], "confidence": round(float(c.get("confidence", 0.5)), 2)})
        if c.get("primary"):
            rec["primary"] = True
    return clean, None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("input")
    ap.add_argument("output")
    ap.add_argument("--review-below", type=float, default=0.7)
    args = ap.parse_args()
    try:
        import anthropic
    except ImportError:
        sys.exit("Install the SDK first: pip install anthropic")
    client = anthropic.Anthropic()
    model = os.environ.get("CLAUDE_MODEL", "claude-sonnet-5-5")
    system = system_prompt()
    review_path = os.path.splitext(args.output)[0] + ".review.jsonl"
    n = flagged = 0
    with open(args.input, encoding="utf-8") as fin, open(args.output, "w", encoding="utf-8") as fout, open(review_path, "w", encoding="utf-8") as frev:
        for line in fin:
            if not line.strip():
                continue
            rec = json.loads(line)
            if rec.get("speaker_side") == "acme" or rec.get("source") == "crm":
                rec["codes"] = []  # rep lines and CRM fields aren't coded
            else:
                rec["codes"], err = code_one(client, model, system, rec)
                if err or any(c["confidence"] < args.review_below for c in rec["codes"]):
                    frev.write(json.dumps({**rec, "error": err}) + "\n")
                    flagged += 1
            fout.write(json.dumps(rec) + "\n")
            n += 1
    print(f"coded {n} excerpts; {flagged} need review in {review_path}")


if __name__ == "__main__":
    main()
