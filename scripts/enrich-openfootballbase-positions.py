#!/usr/bin/env python3
"""Enriquece candidatos com posições específicas de futebol via Wikidata P413."""
from __future__ import annotations

import argparse
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from urllib.error import HTTPError
from collections import Counter
from pathlib import Path

API = "https://www.wikidata.org/w/api.php"
USER_AGENT = "FootballManagerBrowserRosterResearch/1.1 (https://github.com/Diegotbq/football-manager-browser)"
BATCH_SIZE = 50

ALIASES = {
    "goalkeeper": "GK", "goal keeper": "GK", "association football goalkeeper": "GK",
    "centre back": "CB", "center back": "CB", "centre back defender": "CB",
    "central defender": "CB", "centre half": "CB", "center half": "CB",
    "left back": "LB", "left fullback": "LB", "left full back": "LB",
    "right back": "RB", "right fullback": "RB", "right full back": "RB",
    "defensive midfielder": "DM", "holding midfielder": "DM", "deep lying midfielder": "DM",
    "central midfielder": "CM", "centre midfielder": "CM", "center midfielder": "CM",
    "attacking midfielder": "AM", "offensive midfielder": "AM",
    "left winger": "LW", "left wing": "LW",
    "right winger": "RW", "right wing": "RW",
    "striker": "ST", "centre forward": "ST", "center forward": "ST",
    "centre forward striker": "ST", "forward striker": "ST",
    "second striker": "ST", "stopper": "CB", "centerhalf": "CB",
    "left midfielder": "LM", "right midfielder": "RM",
}


def normalize_label(value: object) -> str:
    return " ".join(re.sub(r"[^a-z0-9]+", " ", str(value or "").casefold()).split())


def map_position_labels(labels: list[str]) -> tuple[str | None, str]:
    mapped = sorted({ALIASES[normalize_label(label)] for label in labels
                     if normalize_label(label) in ALIASES})
    if len(mapped) == 1:
        return mapped[0], "mapped"
    if len(mapped) > 1:
        return None, "ambiguous"
    return None, "not-specific-enough"


def api_get(params: dict) -> dict:
    url = API + "?" + urllib.parse.urlencode(params)
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    for attempt in range(8):
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            if error.code not in (429, 500, 502, 503, 504) or attempt == 7:
                raise
            retry_after = error.headers.get("Retry-After")
            try:
                wait_seconds = float(retry_after) if retry_after else 0
            except ValueError:
                wait_seconds = 0
            # Wikidata aplica limites por IP; respeitar Retry-After e recuar
            # progressivamente para evitar repetir rajadas que causam novos 429.
            time.sleep(max(wait_seconds, min(90, 5 * (2 ** attempt))))
        except (TimeoutError, urllib.error.URLError):
            if attempt == 7:
                raise
            time.sleep(min(60, 3 * (2 ** attempt)))
    raise RuntimeError("Wikidata request failed")


def batches(items: list[str], size: int = BATCH_SIZE):
    for start in range(0, len(items), size):
        yield items[start:start + size]


def normalize_player_name(value: object) -> str:
    import unicodedata
    normalized = unicodedata.normalize('NFKD', str(value or ''))
    ascii_name = ''.join(ch for ch in normalized if not unicodedata.combining(ch))
    return ' '.join(re.sub(r'[^a-z0-9]+', ' ', ascii_name.casefold()).split())


def enrich_positions(staging: dict, fetcher=api_get, pause: float = 1.5, database=None) -> dict:
    candidates = staging.get("candidates", [])
    qid_counts = Counter(
        str(c.get("sourcePlayerQid")) for c in candidates if c.get("sourcePlayerQid")
    )
    existing_names = set()
    if database is not None:
        existing_names = {
            normalize_player_name(p.get("name"))
            for p in database.get("players", [])
            if normalize_player_name(p.get("name"))
        }
    lookup_candidates = [
        c for c in candidates
        if c.get("sourcePlayerQid")
        and qid_counts[str(c.get("sourcePlayerQid"))] == 1
        and c.get("eligibleForManualReview")
        and (c.get("clubMapping") or {}).get("status") == "exact-name-match-review-required"
        and (database is None or normalize_player_name(c.get("name")) not in existing_names)
    ]
    qids = sorted({str(c.get("sourcePlayerQid")) for c in lookup_candidates})
    lookup_qid_set = set(qids)
    player_claims = {}
    for index, batch in enumerate(batches(qids)):
        payload = fetcher({
            "action": "wbgetentities", "ids": "|".join(batch),
            "props": "claims", "format": "json"
        })
        for qid, entity in payload.get("entities", {}).items():
            if "missing" not in entity:
                player_claims[qid] = entity.get("claims", {})
        if pause and index < (len(qids) - 1) // BATCH_SIZE:
            time.sleep(pause)

    position_qids = sorted({
        claim.get("mainsnak", {}).get("datavalue", {}).get("value", {}).get("id")
        for claims in player_claims.values()
        for claim in claims.get("P413", [])
        if claim.get("mainsnak", {}).get("snaktype") == "value"
        and claim.get("mainsnak", {}).get("datavalue", {}).get("value", {}).get("id")
    })
    position_labels = {}
    for index, batch in enumerate(batches(position_qids)):
        payload = fetcher({
            "action": "wbgetentities", "ids": "|".join(batch),
            "props": "labels", "languages": "en", "format": "json"
        })
        for qid, entity in payload.get("entities", {}).items():
            label = entity.get("labels", {}).get("en", {}).get("value")
            if label:
                position_labels[qid] = label
        if pause and index < (len(position_qids) - 1) // BATCH_SIZE:
            time.sleep(pause)

    output_candidates = []
    counts = Counter()
    for candidate in candidates:
        row = dict(candidate)
        qid = str(row.get("sourcePlayerQid") or "")
        claims = player_claims.get(qid, {})
        p413 = claims.get("P413", [])
        target_qids = sorted({
            claim.get("mainsnak", {}).get("datavalue", {}).get("value", {}).get("id")
            for claim in p413
            if claim.get("mainsnak", {}).get("snaktype") == "value"
            and claim.get("mainsnak", {}).get("datavalue", {}).get("value", {}).get("id")
        })
        labels = [position_labels[q] for q in target_qids if q in position_labels]
        specific, status = map_position_labels(labels)
        if qid not in lookup_qid_set:
            status = "not-looked-up-existing-or-duplicate"
        row["positionLookup"] = {
            "provider": "Wikidata",
            "property": "P413",
            "positionQids": target_qids,
            "positionLabels": labels,
            "status": status,
        }
        if specific:
            row["specificPosition"] = specific
            counts[specific] += 1
        else:
            row["specificPosition"] = None
            counts[status] += 1
        output_candidates.append(row)

    return {
        "schemaVersion": 1,
        "status": "position-enrichment-review-only",
        "sourceSeason": staging.get("season"),
        "positionSource": "Wikidata P413 (CC0)",
        "candidateCount": len(output_candidates),
        "lookedUpUniquePlayers": len(qids),
        "positionLabelsFound": len(position_labels),
        "specificPositionCount": sum(counts[p] for p in ("GK", "CB", "LB", "RB", "DM", "CM", "AM", "LM", "RM", "LW", "RW", "ST")),
        "positionStatusCounts": dict(counts),
        "candidates": output_candidates,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--database", type=Path, help="Evita consultar jogadores já existentes no banco")
    args = parser.parse_args()
    staging = json.loads(args.input.read_text(encoding="utf-8"))
    database = json.loads(args.database.read_text(encoding="utf-8")) if args.database else None
    result = enrich_positions(staging, database=database)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: result[key] for key in (
        "candidateCount", "lookedUpUniquePlayers", "positionLabelsFound",
        "specificPositionCount", "positionStatusCounts"
    )}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
