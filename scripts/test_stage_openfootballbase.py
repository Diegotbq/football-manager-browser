import importlib.util
import unittest
from datetime import date
from pathlib import Path

module_path = Path(__file__).with_name("stage-openfootballbase.py")
spec = importlib.util.spec_from_file_location("stage_openfootballbase", module_path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
age_on, clean_qid, usable = module.age_on, module.clean_qid, module.usable


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

    def test_placeholders_are_missing(self):
        for value in (None, "", "—", "N/A", "unknown"):
            self.assertFalse(usable(value))
        self.assertTrue(usable("Brazil"))


if __name__ == "__main__":
    unittest.main()
