#!/usr/bin/env python3
"""Apply manually reviewed OpenFootballBase metadata; fill missing fields only."""
import argparse, json, re
from datetime import date
from pathlib import Path

def age_on(dob, as_of):
    born, today = date.fromisoformat(dob), date.fromisoformat(as_of)
    if born > today:
        raise ValueError(f"Future birth date: {dob}")
    return today.year-born.year-((today.month,today.day)<(born.month,born.day))

def missing(v):
    return v is None or v == 0 or (isinstance(v,str) and v.strip().lower() in {"","-","—","n/a","unknown","null"})

def apply(db, approval):
    if approval.get("approved") is not True or approval.get("operation") != "fill-missing-player-age-and-nationality-only":
        raise ValueError("Approval scope invalid")
    if approval.get("source") != "OpenFootballBase-Data" or approval.get("license") != "CC BY-SA 4.0 (Wikipedia-derived squad data; preserve attribution)":
        raise ValueError("Unexpected source/license")
    teams={str(t.get("id")):t for t in db.get("teams",[])}
    players={str(p.get("id")):p for p in db.get("players",[])}
    report={"matched":0,"agesFilled":0,"nationalitiesFilled":0,"preservedExisting":0,"records":[]}
    seen=set()
    for row in approval.get("records",[]):
        pid=str(row.get("playerId",""))
        if not pid or pid in seen: raise ValueError(f"Missing/duplicate player ID: {pid}")
        seen.add(pid)
        if not re.fullmatch(r"Q[1-9][0-9]*",str(row.get("sourcePlayerQid",""))): raise ValueError(f"Invalid QID: {pid}")
        if not isinstance(row.get("sourceRevision"),int) or row["sourceRevision"]<=0: raise ValueError(f"Invalid source revision: {pid}")
        if row.get("stint")=="left_mid": raise ValueError(f"Player left club mid-season: {pid}")
        if not row.get("officialRosterUrl","").startswith("https://www.atleticodemadrid.com/") or not row.get("uefaRosterUrl","").startswith("https://www.uefa.com/"):
            raise ValueError(f"Missing official roster cross-check: {pid}")
        team=teams.get(str(row.get("teamId"))); player=players.get(pid)
        if team is None or player is None: raise ValueError(f"Missing team/player: {pid}")
        if player.get("name")!=row.get("name") or str(player.get("teamId"))!=str(row.get("teamId")):
            raise ValueError(f"Player identity/team mismatch: {pid}")
        team_rows=[p for p in (team.get("players") or []) if str(p.get("id"))==pid]
        if len(team_rows)!=1 or team_rows[0].get("name")!=row.get("name"):
            raise ValueError(f"Team roster identity mismatch: {pid}")
        age=age_on(row["dateOfBirth"],approval["asOf"])
        report["matched"]+=1
        for target in (player,team_rows[0]):
            if missing(target.get("age")):
                target["age"]=age; report["agesFilled"]+=1
            if missing(target.get("nationality")):
                target["nationality"]=row["nationality"]; report["nationalitiesFilled"]+=1
        metadata={
            "provider":"OpenFootballBase-Data","release":approval["sourceRelease"],
            "license":approval["license"],"sourcePlayerQid":row["sourcePlayerQid"],
            "sourceTitle":row["sourceTitle"],"sourceRevision":row["sourceRevision"],
            "dateOfBirth":row["dateOfBirth"],"verifiedAt":approval["asOf"],
            "officialRosterUrl":row["officialRosterUrl"],"uefaRosterUrl":row["uefaRosterUrl"]
        }
        for target in (player,team_rows[0]):
            sources=target.setdefault("metadataSources",[])
            if not any(s.get("provider")==metadata["provider"] and s.get("sourcePlayerQid")==metadata["sourcePlayerQid"] for s in sources):
                sources.append(metadata)
        report["records"].append({"playerId":pid,"name":row["name"],"age":age,"nationality":row["nationality"]})
    return db,report

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--database",required=True); ap.add_argument("--approval",required=True)
    ap.add_argument("--out",required=True); ap.add_argument("--report",required=True)
    a=ap.parse_args()
    db=json.loads(Path(a.database).read_text(encoding="utf-8"))
    approval=json.loads(Path(a.approval).read_text(encoding="utf-8"))
    updated,report=apply(db,approval)
    Path(a.out).write_text(json.dumps(updated,ensure_ascii=False,indent=2)+"\\n",encoding="utf-8")
    Path(a.report).write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\\n",encoding="utf-8")
    print(json.dumps(report,ensure_ascii=False,indent=2))
if __name__=="__main__": main()
