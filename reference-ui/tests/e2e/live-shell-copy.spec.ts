import {expect,test} from "@playwright/test";
import {fullVendorMock} from "./vendor-full-mock";
test("live shell does not present fictional notifications or simulated-action help",async({page})=>{
  const state=await fullVendorMock(page);await page.goto("/procurement/workspace/vendors");
  await page.getByRole("button",{name:"View notifications",exact:true}).click();await expect(page.getByText("Notifications are not available here yet.",{exact:false})).toBeVisible();await expect(page.getByText("Purchase request awaiting review",{exact:true})).toHaveCount(0);await expect(page.getByText("Notifications are fictional. No email is sent.",{exact:true})).toHaveCount(0);
  await page.getByRole("button",{name:"Close dialog",exact:true}).click();await page.getByRole("button",{name:"Help & workflow guide",exact:true}).click();await expect(page.getByText("Follow requests, quotations, orders, deliveries and bills from one workspace.",{exact:false})).toBeVisible();await expect(page.getByRole("button",{name:"About demo actions",exact:true})).toHaveCount(0);expect(state.writes).toHaveLength(0);
});
