"""Pure unit-state checks; importing the controller never starts a unit or browser."""
import importlib.util,pathlib,sys,unittest
scripts=pathlib.Path(__file__).resolve().parents[3]/'scripts';sys.path.insert(0,str(scripts))
spec=importlib.util.spec_from_file_location('plan_outer',scripts/'run-plan-native-outer.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class OuterContract(unittest.TestCase):
    def test_only_stopped_or_removed_is_eligible_for_separate_identity_and_empty_proof(self):
        self.assertTrue(module.unit_is_stopped({'LoadState':'not-found'}))
        for state in ('inactive','failed'):
            self.assertTrue(module.unit_is_stopped({'LoadState':'loaded','ActiveState':state,'MainPID':'0','ControlPID':'0'}))
        for state in ('active','activating','deactivating','reloading'):
            self.assertFalse(module.unit_is_stopped({'LoadState':'loaded','ActiveState':state,'MainPID':'0','ControlPID':'0'}))
    def test_stale_or_missing_process_state_cannot_confirm_stop(self):
        for fields in ({},{'LoadState':'error'},{'LoadState':'loaded','ActiveState':'inactive'},{'LoadState':'not-found','MainPID':'1'},
          {'LoadState':'loaded','ActiveState':'inactive','MainPID':'1','ControlPID':'0'},
          {'LoadState':'loaded','ActiveState':'inactive','MainPID':'0','ControlPID':'1'}):
            self.assertFalse(module.unit_is_stopped(fields))
if __name__=='__main__':unittest.main()
