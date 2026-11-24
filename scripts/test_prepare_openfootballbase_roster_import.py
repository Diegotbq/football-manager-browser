import importlib.util
import unittest
from pathlib import Path

path = Path(__file__).with_name("prepare-openfootballbase-roster-import.py")
spec = importlib.util.spec_from_file_location("roster_import_preview", path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class RosterImportPreviewTests(unittest.TestCase):
    def test_adds_only_unique_exactly_mapped_candidates_with_specific_positions(self):
        team = {"id": "a", "name": "Club A", "leagueId": "league-a", "players": []}
        db = {"teams": [team], "players": []}
        staging = {"sourceSeason": "2026/27", "candidates": [{
            "name": "Player One", "sourcePlayerQid": "Q100", "age": 24,
            "birthDate": "2002-03-04", "nationality": "BRA",
            "eligibleForManualReview": True, "specificPosition": "GK",
            "positionLookup": {"positionQids": ["Q200"]},
            "sourceTitle": "Club A", "sourceRevision": 123,
            "sourceLanguage": "en", "sourceSection": "Current squad",
            "clubMapping": {"status": "exact-name-match-review-required", "teamId": "a"}
        }]}
        preview, report = module.prepare_import(db, staging)
        self.assertEqual(report["newPlayersPrepared"], 1)
        self.assertEqual(len(preview["players"]), 1)
        self.assertEqual(preview["teams"][0]["players"][0]["position"], "GK")
        self.assertEqual(preview["players"][0]["identitySource"]["playerQid"], "Q100")
        self.assertEqual(report["totalPlayersBefore"], 0)

    def test_imports_source_broad_position_without_claiming_exact_role(self):
        db = {"teams": [{"id": "a", "name": "A", "leagueId": "x", "players": []}], "players": []}
        candidate = {
            "name": "Defender One", "sourcePlayerQid": "Q2", "age": 25,
            "birthDate": "2001-01-01", "nationality": "BRA",
            "position": "DF", "specificPosition": None,
            "eligibleForManualReview": True,
            "clubMapping": {"status": "exact-name-match-review-required", "teamId": "a"}
        }
        preview, report = module.prepare_import(db, {"sourceSeason": "2026/27", "candidates": [candidate]})
        player = preview["players"][0]
        self.assertEqual(report["newPlayersPrepared"], 1)
        self.assertEqual(report["broadCategoryPlayers"], 1)
        self.assertEqual(player["position"], "DF")
        self.assertEqual(player["positionName"], "Defensor")
        self.assertEqual(player["positionPrecision"], "broad-category")

    def test_team_roster_cap_prevents_overfilling(self):
        existing = [{"id": f"p{i}", "name": f"Existing {i}"} for i in range(30)]
        db = {"teams": [{"id": "a", "name": "A", "leagueId": "x", "players": existing}],
              "players": list(existing)}
        candidate = {
            "name": "New Player", "sourcePlayerQid": "Q3", "age": 25,
            "birthDate": "2001-01-01", "nationality": "BRA",
            "position": "FW", "eligibleForManualReview": True,
            "clubMapping": {"status": "exact-name-match-review-required", "teamId": "a"}
        }
        _, report = module.prepare_import(db, {"sourceSeason": "2026/27", "candidates": [candidate]})
        self.assertEqual(report["newPlayersPrepared"], 0)
        self.assertEqual(report["skipped"]["team_roster_cap_reached"], 1)

    def test_never_imports_duplicate_qid_or_unsupported_position(self):
        db = {"teams": [{"id": "a", "name": "A", "leagueId": "x", "players": []}], "players": []}
        base = {
            "name": "Player", "sourcePlayerQid": "Q1", "age": 25,
            "birthDate": "2001-01-01", "nationality": "BRA",
            "eligibleForManualReview": True,
            "clubMapping": {"status": "exact-name-match-review-required", "teamId": "a"}
        }
        one = dict(base, position="UNKNOWN", specificPosition=None)
        two = dict(base, position="UNKNOWN", specificPosition=None)
        preview, report = module.prepare_import(db, {"sourceSeason": "2026/27", "candidates": [one, two]})
        self.assertEqual(report["newPlayersPrepared"], 0)
        self.assertEqual(report["skipped"]["missing_or_duplicate_qid"], 2)

    def test_does_not_duplicate_existing_player_names(self):
        db = {"teams": [{"id": "a", "name": "A", "leagueId": "x", "players": []}],
              "players": [{"id": "old", "name": "Player"}]}
        candidate = {
            "name": "Player", "sourcePlayerQid": "Q1", "age": 25,
            "birthDate": "2001-01-01", "nationality": "BRA",
            "eligibleForManualReview": True, "specificPosition": "ST",
            "clubMapping": {"status": "exact-name-match-review-required", "teamId": "a"}
        }
        _, report = module.prepare_import(db, {"sourceSeason": "2026/27", "candidates": [candidate]})
        self.assertEqual(report["newPlayersPrepared"], 0)
        self.assertEqual(report["skipped"]["name_already_exists_in_database"], 1)


if __name__ == "__main__":
    unittest.main()
