#!/usr/bin/env python3
"""Fill only missing age/nationality from explicitly approved official LALIGA profiles."""
import argparse, json, re
from datetime import date
from pathlib import Path

def age_on(dob: str, as_of: str) -> int:
    birth = date.fromisoformat(dob)
    today = date.fromisoformat(as_of)
    if birth > today:
        raise ValueError(f"Date of birth is after verification date: {dob}")
    return today.year - birth.year - ((today.month, today.day) < (birth.month, birth.day))

def missing(v):
    return v is None or v == 0 or (isinstance(v, str) and v.strip().lower() in {"", "-", "—", "n/a", "unknown", "null"})

def apply(db, approval):
    if approval.get("approved") is not True or approval.get("operation") != "fill-missing-player-age-and-nationality-only":
        raise ValueError("Approval scope is not valid")
    if approval.get("source") != "LALIGA official player profiles":
        raise ValueError("Unexpected source")
    teams = {str(t.get("id")): t for t in db.get("teams", [])}
    flat = {str(p.get("id")): p for p in db.get("players", [])}
    report = {"matched": 0, "agesFilled": 0, "nationalitiesFilled": 0, "preservedExisting": 0, "records": []}
    seen = set()
    for row in approval.get("records", []):
        pid = str(row.get("playerId", ""))
        if not pid or pid in seen:
            raise ValueError(f"Missing or duplicate player ID: {pid}")
        seen.add(pid)
        if not re.fullmatch(r"[A-Z]{3}", str(row.get("nationality", ""))):
            raise ValueError(f"Invalid ISO alpha-3 nationality for {pid}")
        if not str(row.get("sourceUrl", "")).startswith("https://www.laliga.com/"):
            raise ValueError(f"Non-official source URL for {pid}")
        team = teams.get(str(row.get("teamId")))
        player = flat.get(pid)
        if team is None or player is None:
            raise ValueError(f"Missing team or player: {pid}")
        if player.get("name") != row.get("name") or str(player.get("teamId")) != str(row.get("teamId")):
            raise ValueError(f"Player identity/team mismatch: {pid}")
        team_rows = [p for p in (team.get("players") or []) if str(p.get("id")) == pid]
        if len(team_rows) != 1 or team_rows[0].get("name") != row.get("name"):
            raise ValueError(f"Team roster identity mismatch: {pid}")
        roster_player = team_rows[0]
        report["matched"] += 1
        age = age_on(row["dateOfBirth"], approval["asOf"])
        for target in (player, roster_player):
            if missing(target.get("age")):
                target["age"] = age
                report["agesFilled"] += 1
            elif int(target["age"]) != age and target is player:
                report["preservedExisting"] += 1
            if missing(target.get("nationality")):
                target["nationality"] = row["nationality"]
                report["nationalitiesFilled"] += 1
            elif target["nationality"] != row["nationality"] and target is player:
                report["preservedExisting"] += 1
            target["identitySource"] = {
                "provider": "LALIGA",
                "sourceUrl": row["sourceUrl"],
                "dateOfBirth": row["dateOfBirth"],
                "verifiedAt": approval["asOf"]
            }
        report["records"].append({"playerId": pid, "name": row["name"], "age": age, "nationality": row["nationality"]})
    return db, report

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--database", required=True)
    parser.add_argument("--approval", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--report", required=True)
    args = parser.parse_args()
    db = json.loads(Path(args.database).read_text(encoding="utf-8"))
    approval = json.loads(Path(args.approval).read_text(encoding="utf-8"))
    updated, report = apply(db, approval)
    Path(args.out).write_text(json.dumps(updated, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    Path(args.report).write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
