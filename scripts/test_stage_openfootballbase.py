import importlib.util
import unittest
from datetime import date
from pathlib import Path

module_path = Path(__file__).with_name("stage-openfootballbase.py")
spec = importlib.util.spec_from_file_location("stage_openfootballbase", module_path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
age_on, clean_qid, usable = module.age_on, module.clean_qid, module.usable
normalize_club_name = module.normalize_club_name
resolve_club_mapping = module.resolve_club_mapping


class StageOpenFootballBaseTests(unittest.TestCase):
    def test_age_before_birthday(self):
        self.assertEqual(age_on("2000-12-25", 11, date(2026, 11, 24)), 25)

    def test_age_after_birthday(self):
        self.assertEqual(age_on("2000-01-01", 11, date(2026, 11, 24)), 26)

    def test_imprecise_birth_is_not_used(self):
        self.assertIsNone(age_on("2000-01-01", 10, date(2026, 11, 24)))

    def test_future_birth_is_rejected(self):
        self.assertIsNone(age_on("2027-01-01", 11, date(2026, 11, 24)))

    def test_qid_validation(self):
        self.assertEqual(clean_qid("Q123"), "Q123")
        self.assertIsNone(clean_qid(""))
        self.assertIsNone(clean_qid("name:Player"))

    def test_club_name_normalization_removes_accents_and_punctuation(self):
        self.assertEqual(normalize_club_name("Atlético-MG"), "atletico mg")

    def test_club_mapping_requires_exact_league_scoped_match(self):
        teams = [
            {"id": "1", "leagueId": "brasileirao", "name": "Atletico MG"},
            {"id": "2", "leagueId": "premier-league", "name": "Atletico MG"},
        ]
        result = resolve_club_mapping("Atlético-MG", "brasileirao", teams)
        self.assertEqual(result["status"], "exact-name-match-review-required")
        self.assertEqual(result["teamId"], "1")
        self.assertEqual(
            resolve_club_mapping("Atletico MG", "la-liga", teams)["status"],
            "unmatched"
        )

    def test_duplicate_club_match_is_ambiguous(self):
        teams = [
            {"id": "1", "leagueId": "brasileirao", "name": "Club A"},
            {"id": "2", "leagueId": "brasileirao", "name": "Club A"},
        ]
        self.assertEqual(
            resolve_club_mapping("Club A", "brasileirao", teams)["status"],
            "ambiguous-exact-match"
        )

    def test_placeholders_are_missing(self):
        for value in (None, "", "—", "N/A", "unknown"):
            self.assertFalse(usable(value))
        self.assertTrue(usable("Brazil"))


if __name__ == "__main__":
    unittest.main()
