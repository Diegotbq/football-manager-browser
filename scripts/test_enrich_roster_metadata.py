import importlib.util
import unittest
from pathlib import Path

module_path = Path(__file__).with_name("enrich-roster-metadata.py")
spec = importlib.util.spec_from_file_location("enrich_roster_metadata", module_path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
enrich = module.enrich


class EnrichRosterMetadataTests(unittest.TestCase):
    def test_fills_only_missing_age_and_nationality_without_adding_players(self):
        player = {"id": "p1", "name": "Player One", "age": None, "nationality": None}
        db = {"teams": [{"id": "t1", "name": "Team", "leagueId": "league",
                         "players": [dict(player)]}], "players": [dict(player)]}
        staging = {"season": "2026/27", "ageCalculatedAsOf": "2026-11-24",
                   "candidates": [{
                       "name": "Player One", "sourcePlayerQid": "Q1", "age": 25,
                       "nationality": "BRA", "eligibleForManualReview": True,
                       "sourceTitle": "Team", "sourceRevision": 123,
                       "sourceLanguage": "en", "sourceSection": "Current squad",
                       "clubMapping": {"status": "exact-name-match-review-required", "teamId": "t1"}
                   }]}
        result, report = enrich(db, staging)
        self.assertEqual(result["teams"][0]["players"][0]["age"], 25)
        self.assertEqual(result["players"][0]["nationality"], "BRA")
        self.assertEqual(report["agesFilled"], 1)
        self.assertEqual(report["nationalitiesFilled"], 1)
        self.assertEqual(len(result["players"]), 1)

    def test_never_overwrites_existing_metadata(self):
        player = {"id": "p1", "name": "Player One", "age": 24, "nationality": "ARG"}
        db = {"teams": [{"id": "t1", "name": "Team", "leagueId": "league",
                         "players": [dict(player)]}], "players": [dict(player)]}
        staging = {"season": "2026/27", "candidates": [{
            "name": "Player One", "sourcePlayerQid": "Q1", "age": 25,
            "nationality": "BRA", "eligibleForManualReview": True,
            "clubMapping": {"status": "exact-name-match-review-required", "teamId": "t1"}
        }]}
        result, report = enrich(db, staging)
        self.assertEqual(result["players"][0]["age"], 24)
        self.assertEqual(result["players"][0]["nationality"], "ARG")
        self.assertEqual(report["existingValuesPreserved"], 2)

    def test_excludes_duplicate_identity_and_non_exact_club_mapping(self):
        db = {"teams": [{"id": "t1", "name": "Team", "leagueId": "league",
                         "players": [{"id": "p1", "name": "Player One"}]}],
              "players": [{"id": "p1", "name": "Player One"}]}
        staging = {"season": "2026/27", "candidates": [
            {"name": "Player One", "sourcePlayerQid": "Q1", "age": 25,
             "nationality": "BRA", "eligibleForManualReview": True,
             "clubMapping": {"status": "exact-name-match-review-required", "teamId": "t1"}},
            {"name": "Player One", "sourcePlayerQid": "Q1", "age": 25,
             "nationality": "BRA", "eligibleForManualReview": True,
             "clubMapping": {"status": "unmatched"}},
        ]}
        result, report = enrich(db, staging)
        self.assertEqual(report["matchedPlayers"], 0)
        self.assertEqual(report["duplicateSourceIdentitiesExcluded"], 1)
        self.assertEqual(result["players"][0].get("age"), None)


if __name__ == "__main__":
    unittest.main()
