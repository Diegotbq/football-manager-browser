#!/usr/bin/env python3
"""
Gera uma fila de candidatos OpenFootballBase para revisão manual.
Não altera database.json e nunca aprova automaticamente um elenco.
Requer: pip install duckdb
Uso:
  python3 scripts/stage-openfootballbase.py --data-dir ./openfootballbase-data --out ./data/staging/openfootballbase-2026-27.json
"""
from __future__ import annotations

import argparse
import json
import re
from datetime import date
from pathlib import Path

COMPETITIONS = {
    "ENG-PL": "premier-league",
    "ESP-LL": "la-liga",
    "BRA-SA": "brasileirao",
    "FRA-L1": "ligue-1",
    "NLD-ED": "eredivisie",
    "PRT-PL": "primeira-liga",
    "BEL-PL": "belgian-pro-league",
    "SCO-L1": "scottish-premiership",
    "CHE-L1": "swiss-super-league",
    "TUR-SL": "super-lig",
    "HRV-L1": "hnl-croatia",
    "ARG-PD": "argentina",
    "URY-L1": "uruguay",
    "ECU-L1": "ecuador",
    "PRY-L1": "paraguay",
    "CHL-L1": "chile",
    "COL-L1": "colombia",
}
PLACEHOLDERS = {"", "—", "-", "n/a", "na", "null", "unknown"}


def usable(value: object) -> bool:
    return str(value if value is not None else "").strip().lower() not in PLACEHOLDERS


def age_on(birth_date: str | None, precision: int | None, as_of: date) -> int | None:
    if precision != 11 or not birth_date:
        return None
    try:
        born = date.fromisoformat(birth_date[:10])
    except (TypeError, ValueError):
        return None
    if born > as_of:
        return None
    return as_of.year - born.year - ((as_of.month, as_of.day) < (born.month, born.day))


def clean_qid(value: object) -> str | None:
    qid = str(value or "").strip()
    return qid if re.fullmatch(r"Q[1-9][0-9]*", qid) else None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, required=True,
                        help="Pasta extraída da release OpenFootballBase")
    parser.add_argument("--season", default="2026/27")
    parser.add_argument("--as-of", default=date.today().isoformat(),
                        help="Data para calcular idade (YYYY-MM-DD)")
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()

    try:
        import duckdb
    except ImportError:
        raise SystemExit("Dependência ausente: instale com 'python3 -m pip install duckdb'.")

    try:
        as_of = date.fromisoformat(args.as_of)
    except ValueError:
        raise SystemExit("--as-of precisa estar no formato YYYY-MM-DD.")

    squad_glob = (args.data_dir / "squad" / "*.parquet").as_posix()
    birth_glob = (args.data_dir / "birth" / "*.parquet").as_posix()
    if not list((args.data_dir / "squad").glob("*.parquet")):
        raise SystemExit(f"Nenhum Parquet de elenco encontrado em {args.data_dir / 'squad'}")
    if not list((args.data_dir / "birth").glob("*.parquet")):
        raise SystemExit(f"Nenhum Parquet de nascimento encontrado em {args.data_dir / 'birth'}")

    codes = list(COMPETITIONS)
    placeholders = ", ".join("?" for _ in codes)
    con = duckdb.connect(database=":memory:")
    query = f"""
        SELECT s.season, s.competition, s.club, s.player, s.player_qid,
               s.position, s.nationality, s.stint, s.confidence, s.source,
               s.source_section, s.source_lang, s.source_title, s.source_revid,
               b.birth_date, b.precision
        FROM read_parquet(?) AS s
        LEFT JOIN read_parquet(?) AS b ON b.player_qid = s.player_qid
        WHERE s.season = ? AND s.competition IN ({placeholders})
        ORDER BY s.competition, s.club, s.player
    """
    rows = con.execute(query, [squad_glob, birth_glob, args.season, *codes]).fetchall()
    columns = [item[0] for item in con.description]
    con.close()

    candidates = []
    summary = {}
    seen = set()
    for raw in rows:
        item = dict(zip(columns, raw))
        league_id = COMPETITIONS[item["competition"]]
        club_key = (item["competition"], item["club"])
        entry = summary.setdefault(item["competition"], {
            "leagueId": league_id, "clubsWithRows": set(), "playerRows": 0,
            "eligibleForReview": 0, "missing": {
                "identity": 0, "position": 0, "nationality": 0, "preciseBirthDate": 0
            }
        })
        entry["clubsWithRows"].add(item["club"])
        entry["playerRows"] += 1

        qid = clean_qid(item["player_qid"])
        age = age_on(item["birth_date"], item["precision"], as_of)
        missing = []
        if not qid:
            missing.append("identity")
        if not usable(item["position"]):
            missing.append("position")
        if not usable(item["nationality"]):
            missing.append("nationality")
        if age is None:
            missing.append("preciseBirthDate")
        for field in missing:
            entry["missing"][field] += 1

        # left_mid significa que o atleta saiu desse clube durante a temporada.
        if item["stint"] == "left_mid":
            continue
        dedupe_key = (item["competition"], item["club"], qid or item["player"])
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        candidate = {
            "season": item["season"], "competition": item["competition"],
            "leagueId": league_id, "sourceClub": item["club"],
            "name": item["player"], "sourcePlayerQid": qid,
            "position": item["position"] if usable(item["position"]) else None,
            "nationality": item["nationality"] if usable(item["nationality"]) else None,
            "birthDate": item["birth_date"] if item["precision"] == 11 else None,
            "ageOn": args.as_of, "age": age,
            "stint": item["stint"], "confidence": item["confidence"],
            "source": item["source"], "sourceSection": item["source_section"],
            "sourceLanguage": item["source_lang"],
            "sourceTitle": item["source_title"], "sourceRevision": item["source_revid"],
            "missingRequiredFields": missing,
            "eligibleForManualReview": not missing and item["confidence"] == "attested"
        }
        if candidate["eligibleForManualReview"]:
            entry["eligibleForReview"] += 1
        candidates.append(candidate)

    report = {
        "schemaVersion": 1,
        "status": "staging-only-not-imported",
        "season": args.season,
        "ageCalculatedAsOf": args.as_of,
        "source": {
            "name": "OpenFootballBase-Data",
            "release": "data-1.24.6",
            "url": "https://github.com/florentfougeres/OpenFootballBase-Data/releases/tag/data-1.24.6",
            "licence": "CC BY-SA 4.0 for Wikipedia-derived squad data; Wikidata fields CC0",
            "attribution": "Wikipedia contributors; preserve sourceTitle and sourceRevision for every row"
        },
        "policy": [
            "Este arquivo é uma fila de candidatos, não um elenco aprovado.",
            "Nenhum candidato é associado automaticamente a um teamId do jogo.",
            "Exigir conferência do clube atual, identidade, posição, nacionalidade e idade antes da importação.",
            "Não usar nomes isoladamente para deduplicar; sourcePlayerQid é preferencial.",
            "Não importar passagens left_mid; revisar manualmente unknown, arrived_mid e loan_in.",
            "Cumprir CC BY-SA 4.0 e preservar atribuição e revisão de origem."
        ],
        "coverage": {
            code: {
                **{k: v for k, v in value.items() if k != "clubsWithRows"},
                "clubsWithRows": len(value["clubsWithRows"])
            }
            for code, value in summary.items()
        },
        "candidateCount": len(candidates),
        "manualReviewEligibleCount": sum(1 for c in candidates if c["eligibleForManualReview"]),
        "candidates": candidates
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "output": str(args.out), "season": args.season,
        "candidateCount": report["candidateCount"],
        "manualReviewEligibleCount": report["manualReviewEligibleCount"],
        "competitions": len(report["coverage"])
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
