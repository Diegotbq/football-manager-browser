import importlib.util
import unittest
from pathlib import Path

module_path = Path(__file__).with_name("reconcile-openfootballbase.py")
spec = importlib.util.spec_from_file_location("reconcile_openfootballbase", module_path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
normalize_player_name, reconcile = module.normalize_player_name, module.reconcile


class ReconcileOpenFootballBaseTests(unittest.TestCase):
    def test_name_normalization(self):
        self.assertEqual(normalize_player_name("Joško Gvardiol"), "josko gvardiol")
        self.assertEqual(normalize_player_name("Nico O'Reilly"), "nico o reilly")

    def test_exact_match_and_missing_existing_players(self):
        db = {"teams": [{"id": "a", "name": "Club A", "leagueId": "league-a",
                         "players": [{"id": "p1", "name": "Joško Gvardiol"},
                                     {"id": "p2", "name": "Other Player"}]}]}
        staging = {"season": "2026/27", "candidates": [
            {"name": "Josko Gvardiol", "sourcePlayerQid": "Q1",
             "eligibleForManualReview": True,
             "clubMapping": {"status": "exact-name-match-review-required", "teamId": "a"}},
            {"name": "Unlisted Player", "sourcePlayerQid": "Q2",
             "eligibleForManualReview": True,
             "clubMapping": {"status": "exact-name-match-review-required", "teamId": "a"}},
            {"name": "Wrong Club", "sourcePlayerQid": "Q3",
             "eligibleForManualReview": True,
             "clubMapping": {"status": "suggested-match-review-required", "teamId": "a"}},
        ]}
        report = reconcile(db, staging)
        self.assertEqual(report["teamsCompared"], 1)
        team = report["teams"][0]
        self.assertEqual(team["exactNameMatches"], 1)
        self.assertEqual(team["unmatchedEligibleCandidates"], 1)
        self.assertEqual(team["existingPlayersWithoutUniqueCandidate"], 1)
        self.assertEqual(report["skippedCandidateStatusCounts"]["suggested-match-review-required"], 1)

    def test_safe_age_update_requires_unique_qid_name_and_verified_birthdate(self):
        db = {"teams": [{"id": "a", "name": "Club A", "leagueId": "league-a",
                         "players": [{"id": "p1", "name": "Player One", "age": None}]}]}
        candidate = {
            "name": "Player One", "sourcePlayerQid": "Q100", "age": 24,
            "birthDate": "2002-03-04", "sourceTitle": "Club A",
            "sourceRevision": 123, "sourceLanguage": "en", "source": "wikipedia_season",
            "eligibleForManualReview": True,
            "clubMapping": {"status": "exact-name-match-review-required", "teamId": "a"}
        }
        report = reconcile(db, {"season": "2026/27", "candidates": [candidate]})
        self.assertEqual(report["safeMissingAgeUpdateCount"], 1)
        update = report["safeMissingAgeUpdates"][0]
        self.assertEqual(update["playerId"], "p1")
        self.assertEqual(update["age"], 24)
        self.assertEqual(update["sourcePlayerQid"], "Q100")

    def test_duplicate_qid_blocks_age_update(self):
        db = {"teams": [{"id": "a", "name": "Club A", "leagueId": "league-a",
                         "players": [{"id": "p1", "name": "Player One", "age": None}]}]}
        candidate = {
            "name": "Player One", "sourcePlayerQid": "Q100", "age": 24,
            "birthDate": "2002-03-04", "eligibleForManualReview": True,
            "clubMapping": {"status": "exact-name-match-review-required", "teamId": "a"}
        }
        duplicate = dict(candidate)
        duplicate["clubMapping"] = {"status": "unmatched"}
        report = reconcile(db, {"season": "2026/27", "candidates": [candidate, duplicate]})
        self.assertEqual(report["safeMissingAgeUpdateCount"], 0)

    def test_duplicate_qid_across_clubs_is_flagged(self):
        db = {"teams": [
            {"id": "a", "name": "A", "leagueId": "x", "players": []},
            {"id": "b", "name": "B", "leagueId": "y", "players": []},
        ]}
        staging = {"season": "2026/27", "candidates": [
            {"name": "Player", "sourcePlayerQid": "Q1", "eligibleForManualReview": True,
             "clubMapping": {"status": "exact-name-match-review-required", "teamId": "a"}},
            {"name": "Player", "sourcePlayerQid": "Q1", "eligibleForManualReview": True,
             "clubMapping": {"status": "exact-name-match-review-required", "teamId": "b"}},
        ]}
        report = reconcile(db, staging)
        self.assertEqual(report["duplicateSourceIdentityCount"], 1)
        self.assertEqual(sum(t["duplicateIdentityCandidates"] for t in report["teams"]), 2)


if __name__ == "__main__":
    unittest.main()
