import importlib.util
import unittest
from pathlib import Path

path = Path(__file__).with_name("enrich-openfootballbase-positions.py")
spec = importlib.util.spec_from_file_location("position_enrichment", path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PositionMappingTests(unittest.TestCase):
    def test_maps_specific_supported_positions(self):
        for label, expected in [
            ("Goalkeeper", "GK"), ("Centre-back", "CB"), ("Left-back", "LB"),
            ("Right-back", "RB"), ("Defensive midfielder", "DM"),
            ("Central midfielder", "CM"), ("Attacking midfielder", "AM"),
            ("Left winger", "LW"), ("Right winger", "RW"), ("Striker", "ST")
        ]:
            with self.subTest(label=label):
                self.assertEqual(module.map_position_labels([label]), (expected, "mapped"))

    def test_broad_positions_are_not_guessed(self):
        for label in ("Defender", "Midfielder", "Forward", "Winger"):
            with self.subTest(label=label):
                self.assertEqual(module.map_position_labels([label]), (None, "not-specific-enough"))

    def test_conflicting_positions_are_ambiguous(self):
        self.assertEqual(
            module.map_position_labels(["Centre-back", "Right-back"]),
            (None, "ambiguous")
        )

    def test_enrichment_uses_p413_and_preserves_candidates(self):
        staging = {"season": "2026/27", "candidates": [{
            "name": "Player", "sourcePlayerQid": "Q1", "eligibleForManualReview": True,
            "clubMapping": {"status": "exact-name-match-review-required", "teamId": "a"}
        }]}
        def fake_fetch(params):
            if params.get("props") == "claims":
                return {"entities": {"Q1": {"claims": {"P413": [{
                    "mainsnak": {"snaktype": "value", "datavalue": {"value": {"id": "Q100"}}}
                }]}}}}
            return {"entities": {"Q100": {"labels": {"en": {"value": "Goalkeeper"}}}}}
        result = module.enrich_positions(staging, fetcher=fake_fetch, pause=0)
        row = result["candidates"][0]
        self.assertEqual(row["specificPosition"], "GK")
        self.assertEqual(row["positionLookup"]["provider"], "Wikidata")
        self.assertEqual(result["specificPositionCount"], 1)


if __name__ == "__main__":
    unittest.main()
