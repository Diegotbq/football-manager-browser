import unittest
from datetime import date
from scripts.apply_openfootballbase_verified_metadata import age_on, apply

class OpenFootballBaseApplyTests(unittest.TestCase):
    def test_age(self):
        self.assertEqual(age_on("1994-05-06","2026-11-24"),32)
        self.assertEqual(age_on("1993-01-07","2026-11-24"),33)
    def test_fill_only_and_exact_identity(self):
        db={"players":[{"id":"p1","name":"Test","teamId":"t1","age":None,"nationality":"ESP"}],
            "teams":[{"id":"t1","players":[{"id":"p1","name":"Test","age":None,"nationality":"ESP"}]}]}
        a={"approved":True,"operation":"fill-missing-player-age-and-nationality-only",
           "source":"OpenFootballBase-Data","license":"CC BY-SA 4.0 (Wikipedia-derived squad data; preserve attribution)",
           "asOf":"2026-11-24","sourceRelease":"data-1.24.6",
           "records":[{"playerId":"p1","name":"Test","teamId":"t1","dateOfBirth":"2000-01-01",
             "nationality":"ESP","sourcePlayerQid":"Q123","sourceTitle":"Test season","sourceRevision":123,
             "stint":"unknown","officialRosterUrl":"https://www.atleticodemadrid.com/jugadores-primer-equipo/",
             "uefaRosterUrl":"https://www.uefa.com/nationalassociations/teams/50124--atletico-madrid/squad/"}]}
        updated,report=apply(db,a)
        self.assertEqual(updated["players"][0]["age"],26)
        self.assertEqual(updated["players"][0]["nationality"],"ESP")
        self.assertEqual(report["agesFilled"],2)
        self.assertEqual(len(updated["players"][0]["metadataSources"]),1)
    def test_reject_wrong_team_or_name(self):
        db={"players":[{"id":"p1","name":"Wrong","teamId":"t1"}],"teams":[{"id":"t1","players":[{"id":"p1","name":"Wrong"}]}]}
        a={"approved":True,"operation":"fill-missing-player-age-and-nationality-only",
           "source":"OpenFootballBase-Data","license":"CC BY-SA 4.0 (Wikipedia-derived squad data; preserve attribution)",
           "asOf":"2026-11-24","sourceRelease":"data-1.24.6",
           "records":[{"playerId":"p1","name":"Test","teamId":"t1","dateOfBirth":"2000-01-01",
             "nationality":"ESP","sourcePlayerQid":"Q123","sourceTitle":"Test season","sourceRevision":123,
             "stint":"unknown","officialRosterUrl":"https://www.atleticodemadrid.com/jugadores-primer-equipo/",
             "uefaRosterUrl":"https://www.uefa.com/nationalassociations/teams/50124--atletico-madrid/squad/"}]}
        with self.assertRaises(ValueError): apply(db,a)

if __name__=="__main__": unittest.main()
