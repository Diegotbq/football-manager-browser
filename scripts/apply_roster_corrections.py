#!/usr/bin/env python3
"""Apply explicitly reviewed current-club corrections to the season database."""
import argparse, json
from pathlib import Path

def apply(db, approval):
    if approval.get("approved") is not True or approval.get("season") != "2026/27":
        raise ValueError("Roster correction approval is invalid")
    teams={str(t.get("id")):t for t in db.get("teams",[])}
    players={str(p.get("id")):p for p in db.get("players",[])}
    report={"moved":0,"removed":0,"operations":[]}
    seen=set()
    for op in approval.get("operations",[]):
        pid=str(op.get("playerId",""))
        if not pid or pid in seen: raise ValueError(f"Missing/duplicate player ID: {pid}")
        seen.add(pid)
        if not str(op.get("sourceUrl","")).startswith("https://www.laliga.com/"):
            raise ValueError(f"Non-official source URL: {pid}")
        player=players.get(pid)
        source=teams.get(str(op.get("fromTeamId")))
        if player is None or source is None: raise ValueError(f"Missing player/source team: {pid}")
        if player.get("name")!=op.get("name") or str(player.get("teamId"))!=str(op.get("fromTeamId")):
            raise ValueError(f"Player identity/source team mismatch: {pid}")
        source_rows=[p for p in (source.get("players") or []) if str(p.get("id"))==pid]
        if len(source_rows)!=1 or source_rows[0].get("name")!=op.get("name"):
            raise ValueError(f"Source roster identity mismatch: {pid}")
        kind=op.get("action")
        if kind=="move":
            target=teams.get(str(op.get("toTeamId")))
            if target is None: raise ValueError(f"Missing target team: {pid}")
            if any(str(p.get("id"))==pid for p in (target.get("players") or [])):
                raise ValueError(f"Player already exists in target roster: {pid}")
            roster_entry=source_rows[0]
            source["players"].remove(roster_entry)
            target.setdefault("players",[]).append(roster_entry)
            player["teamId"]=str(op["toTeamId"])
            if "teamId" in roster_entry: roster_entry["teamId"]=str(op["toTeamId"])
            report["moved"]+=1
        elif kind=="remove":
            source["players"].remove(source_rows[0])
            db["players"]=[p for p in db.get("players",[]) if str(p.get("id"))!=pid]
            del players[pid]
            report["removed"]+=1
        else:
            raise ValueError(f"Unsupported roster action for {pid}: {kind}")
        report["operations"].append({"action":kind,"playerId":pid,"name":op["name"],
          "fromTeamId":op["fromTeamId"],"toTeamId":op.get("toTeamId"),"reason":op.get("reason")})
    return db,report

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--database",required=True); parser.add_argument("--approval",required=True)
    parser.add_argument("--out",required=True); parser.add_argument("--report",required=True)
    args=parser.parse_args()
    db=json.loads(Path(args.database).read_text(encoding="utf-8"))
    approval=json.loads(Path(args.approval).read_text(encoding="utf-8"))
    updated,report=apply(db,approval)
    Path(args.out).write_text(json.dumps(updated,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    Path(args.report).write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(report,ensure_ascii=False,indent=2))
if __name__=="__main__": main()
