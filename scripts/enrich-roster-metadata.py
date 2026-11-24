#!/usr/bin/env python3
"""Prepara enriquecimento conservador de idade/nacionalidade; nunca adiciona jogadores."""
from __future__ import annotations

import argparse
import json
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

PLACEHOLDERS = {"", "—", "-", "n/a", "na", "null", "unknown"}


def normalize_player_name(value: object) -> str:
    normalized = unicodedata.normalize("NFKD", str(value or ""))
    ascii_name = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    return " ".join(re.sub(r"[^a-z0-9]+", " ", ascii_name.casefold()).split())


def is_missing(value: object) -> bool:
    return str(value if value is not None else "").strip().lower() in PLACEHOLDERS or value == 0


def is_valid_nationality_code(value: object) -> bool:
    return bool(re.fullmatch(r"[A-Z]{3}", str(value or "").strip()))


def enrich(database: dict, staging: dict) -> tuple[dict, dict]:
    db = json.loads(json.dumps(database))
    teams = {str(team.get("id")): team for team in db.get("teams", [])}
    flat_players = {str(player.get("id")): player for player in db.get("players", [])}
    all_qid_rows: dict[str, list[dict]] = defaultdict(list)
    for candidate in staging.get("candidates", []):
        qid = str(candidate.get("sourcePlayerQid") or "")
        if qid:
            all_qid_rows[qid].append(candidate)
    duplicate_qids = {
        qid for qid, rows in all_qid_rows.items()
        if len(rows) > 1
    }

    by_team_name: dict[tuple[str, str], list[dict]] = defaultdict(list)
    candidate_counts = Counter()
    for candidate in staging.get("candidates", []):
        mapping = candidate.get("clubMapping") or {}
        if mapping.get("status") != "exact-name-match-review-required" or not mapping.get("teamId"):
            candidate_counts["skipped_non_exact_club_mapping"] += 1
            continue
        team_id = str(mapping["teamId"])
        if team_id not in teams:
            candidate_counts["skipped_missing_team"] += 1
            continue
        if not candidate.get("eligibleForManualReview"):
            candidate_counts["skipped_incomplete_metadata"] += 1
            continue
        qid = str(candidate.get("sourcePlayerQid") or "")
        if not qid or qid in duplicate_qids:
            candidate_counts["skipped_duplicate_or_missing_identity"] += 1
            continue
        if not isinstance(candidate.get("age"), int) or candidate["age"] < 15:
            candidate_counts["skipped_invalid_age"] += 1
            continue
        if not is_valid_nationality_code(candidate.get("nationality")):
            candidate_counts["skipped_unrecognized_nationality"] += 1
            continue
        key = normalize_player_name(candidate.get("name"))
        if not key:
            candidate_counts["skipped_empty_name"] += 1
            continue
        by_team_name[(team_id, key)].append(candidate)

    report = {
        "schemaVersion": 1,
        "status": "preview-only-no-new-players-no-overwrites",
        "season": staging.get("season"),
        "ageCalculatedAsOf": staging.get("ageCalculatedAsOf"),
        "matchedPlayers": 0,
        "agesFilled": 0,
        "nationalitiesFilled": 0,
        "existingValuesPreserved": 0,
        "ambiguousPlayerMatches": 0,
        "noExistingPlayerMatch": 0,
        "duplicateSourceIdentitiesExcluded": len(duplicate_qids),
        "candidateCounts": {},
        "teams": [],
    }
    team_updates = Counter()
    for (team_id, name_key), candidates in sorted(by_team_name.items()):
        team = teams[team_id]
        existing = [
            player for player in (team.get("players") or [])
            if normalize_player_name(player.get("name")) == name_key
        ]
        if len(candidates) != 1 or len(existing) != 1:
            if len(existing) > 1 or len(candidates) > 1:
                report["ambiguousPlayerMatches"] += 1
            else:
                report["noExistingPlayerMatch"] += 1
            continue

        candidate = candidates[0]
        player = existing[0]
        flat = flat_players.get(str(player.get("id")))
        targets = [player] + ([flat] if flat is not None and flat is not player else [])
        report["matchedPlayers"] += 1
        filled_age = False
        filled_nationality = False
        for target in targets:
            if is_missing(target.get("age")):
                target["age"] = candidate["age"]
                filled_age = True
            elif target.get("age") != candidate["age"] and target is player:
                report["existingValuesPreserved"] += 1
            if is_missing(target.get("nationality")):
                target["nationality"] = candidate["nationality"]
                filled_nationality = True
            elif target.get("nationality") != candidate["nationality"] and target is player:
                report["existingValuesPreserved"] += 1
            target["identitySource"] = {
                "provider": "OpenFootballBase",
                "season": staging.get("season"),
                "playerQid": candidate["sourcePlayerQid"],
                "pageTitle": candidate.get("sourceTitle"),
                "pageRevision": candidate.get("sourceRevision"),
                "language": candidate.get("sourceLanguage"),
                "section": candidate.get("sourceSection"),
                "license": "Squad data derived from Wikipedia (CC BY-SA 4.0); Wikidata fields CC0",
            }
        if filled_age:
            report["agesFilled"] += 1
            team_updates[team_id] += 1
        if filled_nationality:
            report["nationalitiesFilled"] += 1
            team_updates[team_id] += 1

    report["candidateCounts"] = dict(candidate_counts)
    report["teams"] = [
        {"teamId": team_id, "teamName": teams[team_id].get("name"),
         "leagueId": teams[team_id].get("leagueId"), "metadataFieldsFilled": count}
        for team_id, count in sorted(team_updates.items())
    ]
    report["totalPlayersBefore"] = len(database.get("players", []))
    report["totalPlayersAfter"] = len(db.get("players", []))
    return db, report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, required=True)
    parser.add_argument("--staging", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    database = json.loads(args.database.read_text(encoding="utf-8"))
    staging = json.loads(args.staging.read_text(encoding="utf-8"))
    enriched, report = enrich(database, staging)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(enriched, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: report[key] for key in (
        "matchedPlayers", "agesFilled", "nationalitiesFilled", "existingValuesPreserved",
        "ambiguousPlayerMatches", "noExistingPlayerMatch", "duplicateSourceIdentitiesExcluded",
        "totalPlayersBefore", "totalPlayersAfter", "candidateCounts"
    )}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
