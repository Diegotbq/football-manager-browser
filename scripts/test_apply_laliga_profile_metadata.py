import unittest
from scripts.apply_laliga_profile_metadata import age_on, apply

class MetadataTests(unittest.TestCase):
    def test_age(self):
        self.assertEqual(age_on("1997-06-11", "2026-11-24"), 29)
        self.assertEqual(age_on("2003-09-01", "2026-11-24"), 23)
        self.assertEqual(age_on("1999-07-05", "2026-11-24"), 27)

    def test_fill_only_and_identity(self):
        db = {
            "players": [{"id":"p1","name":"Test Player","teamId":"t1","age":None,"nationality":None}],
            "teams": [{"id":"t1","players":[{"id":"p1","name":"Test Player","age":None,"nationality":None}]}]
        }
        approval = {"approved":True,"operation":"fill-missing-player-age-and-nationality-only",
          "source":"LALIGA official player profiles","asOf":"2026-11-24",
          "records":[{"playerId":"p1","name":"Test Player","teamId":"t1","dateOfBirth":"2000-01-01",
          "nationality":"ESP","sourceUrl":"https://www.laliga.com/jugador/test"}]}
        updated, report = apply(db, approval)
        self.assertEqual(updated["players"][0]["age"], 26)
        self.assertEqual(updated["players"][0]["nationality"], "ESP")
        self.assertEqual(updated["teams"][0]["players"][0]["age"], 26)
        self.assertEqual(report["matched"], 1)

    def test_official_club_profile_source(self):
        db = {
            "players": [{"id":"p2","name":"Betis Player","teamId":"t2","age":None,"nationality":None}],
            "teams": [{"id":"t2","players":[{"id":"p2","name":"Betis Player","age":None,"nationality":None}]}]
        }
        approval = {"approved":True,"operation":"fill-missing-player-age-and-nationality-only",
          "source":"Official LALIGA and club player profiles","asOf":"2026-11-24",
          "records":[{"playerId":"p2","name":"Betis Player","teamId":"t2","dateOfBirth":"2006-05-19",
          "nationality":"ESP","sourceProvider":"REAL_BETIS",
          "sourceUrl":"https://www.realbetisbalompie.es/betis-deportivo/player/test"}]}
        updated, report = apply(db, approval)
        self.assertEqual(updated["players"][0]["age"], 20)
        self.assertEqual(updated["players"][0]["nationality"], "ESP")
        self.assertEqual(updated["players"][0]["identitySource"]["provider"], "REAL_BETIS")
        self.assertEqual(report["matched"], 1)

    def test_official_uefa_squad_source(self):
        db = {"players":[{"id":"p3","name":"UEFA Player","teamId":"t3","age":None,"nationality":None}],
              "teams":[{"id":"t3","players":[{"id":"p3","name":"UEFA Player","age":None,"nationality":None}]}]}
        approval = {"approved":True,"operation":"fill-missing-player-age-and-nationality-only",
          "source":"Official LALIGA, club and UEFA player profiles","asOf":"2026-11-25",
          "records":[{"playerId":"p3","name":"UEFA Player","teamId":"t3","dateOfBirth":"2009-01-29",
          "nationality":"ROU","sourceProvider":"UEFA",
          "sourceUrl":"https://www.uefa.com/news-media/mediaservices/informationkits/competitions/uefachampionsleague/2027/match/2049632/printmatchpresskits/"}]}
        updated, report = apply(db, approval)
        self.assertEqual(updated["players"][0]["age"], 17)
        self.assertEqual(updated["players"][0]["nationality"], "ROU")
        self.assertEqual(updated["players"][0]["identitySource"]["provider"], "UEFA")

    def test_existing_values_are_not_overwritten(self):
        db = {"players":[{"id":"p1","name":"Test Player","teamId":"t1","age":30,"nationality":"ARG"}],
              "teams":[{"id":"t1","players":[{"id":"p1","name":"Test Player","age":30,"nationality":"ARG"}]}]}
        approval = {"approved":True,"operation":"fill-missing-player-age-and-nationality-only",
          "source":"LALIGA official player profiles","asOf":"2026-11-24",
          "records":[{"playerId":"p1","name":"Test Player","teamId":"t1","dateOfBirth":"2000-01-01",
          "nationality":"ESP","sourceUrl":"https://www.laliga.com/jugador/test"}]}
        updated, report = apply(db, approval)
        self.assertEqual(updated["players"][0]["age"], 30)
        self.assertEqual(updated["players"][0]["nationality"], "ARG")
        self.assertEqual(report["preservedExisting"], 2)

if __name__ == "__main__":
    unittest.main()
