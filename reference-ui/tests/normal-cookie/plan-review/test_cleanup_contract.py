"""Offline pure checks: no HTTP/logout/browser/process-scope mutation."""
import importlib.util,pathlib,sys,unittest
scripts=pathlib.Path(__file__).resolve().parents[3]/'scripts';sys.path.insert(0,str(scripts))
spec=importlib.util.spec_from_file_location('plan_cookie_cleanup',scripts/'cleanup-plan-native-cookies.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class CleanupContract(unittest.TestCase):
    def test_only_actual_auth_rejection_or_explicit_false_confirms_inactive(self):
        for status,body,expected in [(401,b'',False),(200,b'{"authenticated":false}',False),(200,b'{"authenticated":true}',True),(403,b'',None),(404,b'',None),(200,b'html',None),(200,b'{"authenticated":"false"}',None)]:
            with self.subTest(status=status,body=body):self.assertIs(module.authenticate_result(status,body),expected)
    def test_every_fixture_actor_requires_attempt_and_verified_inactive(self):
        rows=[{'actor':role,'logoutAttempted':True,'cookieVerifiedInactive':True}for role in ('owner','reviewer','final')]
        self.assertTrue(module.all_cookie_cleanup_confirmed(rows))
        self.assertFalse(module.all_cookie_cleanup_confirmed(rows[:2]))
        for field in ('logoutAttempted','cookieVerifiedInactive'):
            altered=[dict(row)for row in rows];altered[0][field]=False;self.assertFalse(module.all_cookie_cleanup_confirmed(altered))
        duplicated=[dict(rows[0]),dict(rows[0]),dict(rows[2])];self.assertFalse(module.all_cookie_cleanup_confirmed(duplicated))
if __name__=='__main__':unittest.main()
