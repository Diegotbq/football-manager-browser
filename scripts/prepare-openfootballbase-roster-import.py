#!/usr/bin/env python3
"""Prepara preview de novos jogadores com posição específica; não altera o banco."""
from __future__ import annotations

import argparse
import json
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

SUPPORTED = {"GK", "CB", "LB", "RB", "DM", "CM", "AM", "LM", "RM", "LW", "RW", "ST"}
BROAD_POSITIONS = {"DF": "Defensor", "MF": "Meio-campista", "FW": "Atacante"}
MAX_ROSTER_SIZE = 30


def normalize_name(value: object) -> str:
    normalized = unicodedata.normalize("NFKD", str(value or ""))
    ascii_name = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    return " ".join(re.sub(r"[^a-z0-9]+", " ", ascii_name.casefold()).split())


def prepare_import(database: dict, enriched: dict) -> tuple[dict, dict]:
    preview = json.loads(json.dumps(database))
    teams = {str(t.get("id")): t for t in preview.get("teams", [])}
    existing_names = Counter(normalize_name(p.get("name")) for p in preview.get("players", []))
    all_qids = Counter(
        str(c.get("sourcePlayerQid"))
        for c in enriched.get("candidates", [])
        if c.get("sourcePlayerQid")
    )
    candidate_names = Counter()
    for c in enriched.get("candidates", []):
        mapping = c.get("clubMapping") or {}
        if mapping.get("status") == "exact-name-match-review-required" and mapping.get("teamId"):
            candidate_names[(str(mapping["teamId"]), normalize_name(c.get("name")))] += 1

    report = {
        "schemaVersion": 1,
        "status": "preview-only-no-database-changes",
        "sourceSeason": enriched.get("sourceSeason"),
        "sourcePositionProvider": "Wikidata P413",
        "newPlayersPrepared": 0,
        "skipped": {},
        "teams": [],
        "totalPlayersBefore": len(preview.get("players", [])),
        "totalPlayersAfterPreview": len(preview.get("players", [])),
    }
    skipped = Counter()
    additions_by_team = Counter()
    additions = []
    for candidate in enriched.get("candidates", []):
        mapping = candidate.get("clubMapping") or {}
        if mapping.get("status") != "exact-name-match-review-required" or not mapping.get("teamId"):
            skipped["non_exact_club_mapping"] += 1
            continue
        team_id = str(mapping["teamId"])
        team = teams.get(team_id)
        if team is None:
            skipped["missing_database_team"] += 1
            continue
        if not candidate.get("eligibleForManualReview"):
            skipped["incomplete_identity_or_metadata"] += 1
            continue
        qid = str(candidate.get("sourcePlayerQid") or "")
        if not qid or all_qids[qid] != 1:
            skipped["missing_or_duplicate_qid"] += 1
            continue
        specific_position = candidate.get("specificPosition")
        source_position = str(candidate.get("position") or "").upper()
        if specific_position in SUPPORTED:
            position = specific_position
            position_precision = "specific"
            position_provider = "Wikidata P413"
            position_name = {
                "GK": "Goleiro", "CB": "Zagueiro", "LB": "Lateral-esquerdo",
                "RB": "Lateral-direito", "DM": "Volante", "CM": "Meio-campista",
                "AM": "Meia-atacante", "LM": "Meia-esquerdo", "RM": "Meia-direito",
                "LW": "Ponta-esquerda", "RW": "Ponta-direita", "ST": "Atacante"
            }[position]
        elif source_position == "GK":
            position = "GK"
            position_precision = "specific"
            position_provider = "OpenFootballBase goalkeeper category"
            position_name = "Goleiro"
        elif source_position in BROAD_POSITIONS:
            position = source_position
            position_precision = "broad-category"
            position_provider = "OpenFootballBase squad category"
            position_name = BROAD_POSITIONS[position]
        else:
            skipped["no_supported_position_category"] += 1
            continue
        if not isinstance(candidate.get("age"), int) or not candidate.get("birthDate"):
            skipped["missing_precise_age"] += 1
            continue
        nationality = str(candidate.get("nationality") or "")
        if not re.fullmatch(r"[A-Z]{3}", nationality):
            skipped["invalid_nationality_code"] += 1
            continue
        name = str(candidate.get("name") or "").strip()
        key = normalize_name(name)
        if not key or candidate_names[(team_id, key)] != 1:
            skipped["ambiguous_source_name_in_team"] += 1
            continue
        if existing_names[key] > 0:
            skipped["name_already_exists_in_database"] += 1
            continue
        player_id = f"ofb-202627-{qid.lower()}"
        if any(str(p.get("id")) == player_id for p in preview.get("players", [])):
            skipped["player_id_already_exists"] += 1
            continue

        if len(team.get("players") or []) + additions_by_team[team_id] >= MAX_ROSTER_SIZE:
            skipped["team_roster_cap_reached"] += 1
            continue

        age = candidate["age"]
        overall = max(56, min(67, round(66 - max(0, abs(age - 26) - 4) * 0.45)))
        market_value = int(max(150_000, round(350_000 * (overall / 60) ** 2)))
        player = {
            "id": player_id,
            "name": name,
            "position": position,
            "positionName": position_name,
            "positionPrecision": position_precision,
            "age": age,
            "overall": overall,
            "marketValue": market_value,
            "teamId": team_id,
            "nationality": nationality,
            "injured": False,
            "identitySource": {
                "provider": "OpenFootballBase",
                "season": enriched.get("sourceSeason"),
                "playerQid": qid,
                "pageTitle": candidate.get("sourceTitle"),
                "pageRevision": candidate.get("sourceRevision"),
                "language": candidate.get("sourceLanguage"),
                "section": candidate.get("sourceSection"),
                "license": "Squad data derived from Wikipedia (CC BY-SA 4.0); Wikidata fields CC0",
                "positionProvider": position_provider,
                "positionPrecision": position_precision,
                "positionQids": candidate.get("positionLookup", {}).get("positionQids", []),
            },
            "gameplayEstimate": {
                "overall": "estimated; source does not provide player rating",
                "marketValue": "estimated; source does not provide market value",
                "position": "specific" if position_precision == "specific" else "broad category; no exact role asserted",
            },
        }
        additions.append((team_id, player))
        existing_names[key] += 1
        additions_by_team[team_id] += 1

    for team_id, player in additions:
        teams[team_id].setdefault("players", []).append(dict(player))
        preview.setdefault("players", []).append(dict(player))

    report["newPlayersPrepared"] = len(additions)
    report["specificPositionPlayers"] = sum(1 for _, p in additions if p["positionPrecision"] == "specific")
    report["broadCategoryPlayers"] = sum(1 for _, p in additions if p["positionPrecision"] == "broad-category")
    report["maxRosterSize"] = MAX_ROSTER_SIZE
    report["totalPlayersAfterPreview"] = len(preview.get("players", []))
    report["skipped"] = dict(skipped)
    report["teams"] = [
        {"teamId": team_id, "teamName": teams[team_id].get("name"),
         "leagueId": teams[team_id].get("leagueId"), "newPlayers": count,
         "rosterAfterPreview": len(teams[team_id].get("players", []))}
        for team_id, count in sorted(additions_by_team.items())
    ]
    return preview, report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, required=True)
    parser.add_argument("--staging", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    database = json.loads(args.database.read_text(encoding="utf-8"))
    staging = json.loads(args.staging.read_text(encoding="utf-8"))
    preview, report = prepare_import(database, staging)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(preview, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: report[key] for key in (
        "newPlayersPrepared", "specificPositionPlayers", "broadCategoryPlayers", "maxRosterSize", "totalPlayersBefore", "totalPlayersAfterPreview", "skipped"
    )}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
