import unittest
from scripts.apply_roster_corrections import apply

class RosterCorrectionTests(unittest.TestCase):
    def test_move_player_between_existing_teams(self):
        db={"players":[{"id":"p1","name":"Player","teamId":"t1"}],
            "teams":[{"id":"t1","players":[{"id":"p1","name":"Player"}]},
                     {"id":"t2","players":[]}]}
        approval={"approved":True,"season":"2026/27","operations":[
            {"action":"move","playerId":"p1","name":"Player","fromTeamId":"t1","toTeamId":"t2",
             "sourceUrl":"https://www.laliga.com/jugador/player","reason":"official profile"}]}
        updated,report=apply(db,approval)
        self.assertEqual(updated["players"][0]["teamId"],"t2")
        self.assertEqual(len(updated["teams"][0]["players"]),0)
        self.assertEqual(updated["teams"][1]["players"][0]["id"],"p1")
        self.assertEqual(report["moved"],1)

    def test_remove_player_outside_covered_leagues(self):
        db={"players":[{"id":"p1","name":"Player","teamId":"t1"}],
            "teams":[{"id":"t1","players":[{"id":"p1","name":"Player"}]}]}
        approval={"approved":True,"season":"2026/27","operations":[
            {"action":"remove","playerId":"p1","name":"Player","fromTeamId":"t1",
             "sourceUrl":"https://www.laliga.com/jugador/player","reason":"now at an uncovered club"}]}
        updated,report=apply(db,approval)
        self.assertEqual(updated["players"],[])
        self.assertEqual(updated["teams"][0]["players"],[])
        self.assertEqual(report["removed"],1)

    def test_reject_wrong_team(self):
        db={"players":[{"id":"p1","name":"Player","teamId":"t2"}],
            "teams":[{"id":"t1","players":[{"id":"p1","name":"Player"}]},{"id":"t2","players":[]}]}
        approval={"approved":True,"season":"2026/27","operations":[
            {"action":"move","playerId":"p1","name":"Player","fromTeamId":"t1","toTeamId":"t2",
             "sourceUrl":"https://www.laliga.com/jugador/player"}]}
        with self.assertRaises(ValueError): apply(db,approval)

if __name__=="__main__": unittest.main()
