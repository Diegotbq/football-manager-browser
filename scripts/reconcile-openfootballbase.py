#!/usr/bin/env python3
"""Compara candidatos OpenFootballBase com os elencos atuais sem alterar o banco."""
from __future__ import annotations

import argparse
import json
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path


def normalize_player_name(value: object) -> str:
    normalized = unicodedata.normalize("NFKD", str(value or ""))
    ascii_name = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    return " ".join(re.sub(r"[^a-z0-9]+", " ", ascii_name.casefold()).split())


def reconcile(database: dict, staging: dict) -> dict:
    teams = {str(team.get("id")): team for team in database.get("teams", [])}
    by_team: dict[str, list[dict]] = defaultdict(list)
    qid_rows: dict[str, list[dict]] = defaultdict(list)
    skipped_status = Counter()
    for candidate in staging.get("candidates", []):
        mapping = candidate.get("clubMapping") or {}
        if mapping.get("status") != "exact-name-match-review-required" or not mapping.get("teamId"):
            skipped_status[mapping.get("status", "missing")] += 1
            continue
        team_id = str(mapping["teamId"])
        if team_id not in teams:
            skipped_status["mapped-team-not-in-database"] += 1
            continue
        by_team[team_id].append(candidate)
        qid = candidate.get("sourcePlayerQid")
        if qid:
            qid_rows[str(qid)].append(candidate)

    duplicate_qids = {
        qid for qid, rows in qid_rows.items()
        if len({str((row.get("clubMapping") or {}).get("teamId")) for row in rows}) > 1
    }
    team_reports = []
    totals = Counter()
    for team_id, candidates in sorted(by_team.items(), key=lambda item: (str(teams[item[0]].get("leagueId")), str(teams[item[0]].get("name")))):
        team = teams[team_id]
        existing = team.get("players") or []
        existing_by_name: dict[str, list[dict]] = defaultdict(list)
        for player in existing:
            key = normalize_player_name(player.get("name"))
            if key:
                existing_by_name[key].append(player)

        eligible = [c for c in candidates if c.get("eligibleForManualReview")]
        matched = 0
        unmatched = 0
        ambiguous = 0
        seen_existing = set()
        matched_qids = set()
        for candidate in eligible:
            key = normalize_player_name(candidate.get("name"))
            matches = existing_by_name.get(key, [])
            if len(matches) == 1:
                matched += 1
                seen_existing.add(str(matches[0].get("id")))
                if candidate.get("sourcePlayerQid"):
                    matched_qids.add(candidate["sourcePlayerQid"])
            elif len(matches) > 1:
                ambiguous += 1
            else:
                unmatched += 1
        missing_existing = [
            player for player in existing
            if str(player.get("id")) not in seen_existing
        ]
        report = {
            "leagueId": team.get("leagueId"),
            "teamId": team_id,
            "teamName": team.get("name"),
            "currentRosterCount": len(existing),
            "sourceCandidateCount": len(candidates),
            "eligibleCandidateCount": len(eligible),
            "exactNameMatches": matched,
            "unmatchedEligibleCandidates": unmatched,
            "ambiguousNameMatches": ambiguous,
            "existingPlayersWithoutUniqueCandidate": len(missing_existing),
            "duplicateIdentityCandidates": sum(
                1 for c in eligible if c.get("sourcePlayerQid") in duplicate_qids
            ),
        }
        team_reports.append(report)
        for key in ("currentRosterCount", "sourceCandidateCount", "eligibleCandidateCount",
                    "exactNameMatches", "unmatchedEligibleCandidates", "ambiguousNameMatches",
                    "existingPlayersWithoutUniqueCandidate", "duplicateIdentityCandidates"):
            totals[key] += report[key]

    return {
        "schemaVersion": 1,
        "status": "review-only-no-database-changes",
        "sourceSeason": staging.get("season"),
        "teamsCompared": len(team_reports),
        "totals": dict(totals),
        "skippedCandidateStatusCounts": dict(skipped_status),
        "duplicateSourceIdentityCount": len(duplicate_qids),
        "teams": team_reports,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, required=True)
    parser.add_argument("--staging", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    database = json.loads(args.database.read_text(encoding="utf-8"))
    staging = json.loads(args.staging.read_text(encoding="utf-8"))
    report = reconcile(database, staging)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"teamsCompared": report["teamsCompared"], "totals": report["totals"],
                      "duplicateSourceIdentityCount": report["duplicateSourceIdentityCount"],
                      "skippedCandidateStatusCounts": report["skippedCandidateStatusCounts"]},
                     ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
