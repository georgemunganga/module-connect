"""Pure unit-state checks; importing the controller never starts a unit or browser."""
import importlib.util,pathlib,sys,unittest
scripts=pathlib.Path(__file__).resolve().parents[3]/'scripts';sys.path.insert(0,str(scripts))
spec=importlib.util.spec_from_file_location('plan_outer',scripts/'run-plan-native-outer.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class OuterContract(unittest.TestCase):
    def budget(self):return {'minimumMemoryAvailableBytes':1152*1024**2,'minimumRootFreeBytes':200*1024**2,'memoryMaxBytes':1024*1024**2}
    def test_approved_1152_floor_admits_a_strict_one_gib_service(self):
        self.assertTrue(module.resource_budget_accepted(self.budget(),1152*1024**2,200*1024**2))
    def test_selected_1200_floor_admits_reported_steady_carrier_but_not_below_selected_floor(self):
        selected=self.budget();selected['minimumMemoryAvailableBytes']=1200*1024**2
        self.assertTrue(module.resource_budget_accepted(selected,1264*1024**2,267*1024**2))
        self.assertFalse(module.resource_budget_accepted(selected,1200*1024**2-1,267*1024**2))
    def test_available_memory_and_disk_must_still_meet_the_selected_floors(self):
        self.assertFalse(module.resource_budget_accepted(self.budget(),1152*1024**2-1,300*1024**2))
        self.assertFalse(module.resource_budget_accepted(self.budget(),1492*1024**2,200*1024**2-1))
        stricter=self.budget();stricter['minimumMemoryAvailableBytes']=1536*1024**2
        self.assertFalse(module.resource_budget_accepted(stricter,1492*1024**2,300*1024**2))
    def test_lower_floor_or_larger_service_cap_is_rejected(self):
        for field,value in [('minimumMemoryAvailableBytes',1152*1024**2-1),('memoryMaxBytes',1024*1024**2+1)]:
            invalid=self.budget();invalid[field]=value
            self.assertFalse(module.resource_budget_accepted(invalid,2048*1024**2,300*1024**2))
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
