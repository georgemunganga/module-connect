import { expect, test } from "@playwright/test";
import { mockErp } from "./request-mock";
const own=["procurement-access","procurement-request-read","procurement-request-create","procurement-request-edit","procurement-request-submit"];
test("requester can search and select approved catalog without item stewardship",async({page})=>{
 await mockErp(page,{permissions:[...own,"procurement-item-read"]});
 await page.goto('/procurement/workspace/requests/new?entry=department');
 await page.getByLabel('Search approved items',{exact:true}).fill('chair');
 await expect(page.getByRole('button',{name:'Use item',exact:true})).toBeVisible();await page.getByRole('button',{name:'Use item',exact:true}).click();
 await expect(page.getByLabel('Item or service 1')).toHaveValue('Office chair');
 await expect(page.getByLabel('Estimated unit price',{exact:true})).toHaveValue('250');
 await expect(page.getByRole('navigation',{name:'Main',exact:true}).getByRole('link',{name:'Items',exact:true})).toHaveCount(0);
});
test("requester without catalog lookup gets manual entry and makes no catalog request",async({page})=>{
 await mockErp(page,{permissions:own});const calls:string[]=[];page.on('request',r=>{if(new URL(r.url()).pathname==='/api/procurement/v1/catalog')calls.push(r.url());});
 await page.goto('/procurement/workspace/requests/new?entry=department');
 await expect(page.getByLabel('Search approved items',{exact:true})).toBeDisabled();await expect(page.getByText('Approved item search is not included in your access. You can describe an item below.')).toBeVisible();
 await expect(page.getByLabel('Item or service 1')).toBeEditable();expect(calls).toEqual([]);
});
test("catalog-read alone does not query a hidden Home catalog card",async({page})=>{
 await mockErp(page,{permissions:[...own,"procurement-item-read"]});const calls:string[]=[];page.on('request',r=>{if(new URL(r.url()).pathname==='/api/procurement/v1/catalog')calls.push(r.url());});
 await page.goto('/procurement/workspace/');await expect(page.getByRole('heading',{name:'Welcome',exact:true})).toBeVisible();
 await expect(page.getByText('Catalog entries',{exact:true})).toHaveCount(0);expect(calls).toEqual([]);
});
