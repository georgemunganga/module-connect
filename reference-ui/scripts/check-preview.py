"""Focused integration regressions against the local frontend; no external records."""
import json
import re
import shutil
from playwright.sync_api import sync_playwright, expect

BASE = 'http://127.0.0.1:3000'
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path=shutil.which('chromium'), args=['--no-sandbox'])
    context = browser.new_context(viewport={'width': 1440, 'height': 900})
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda err: errors.append(str(err)))

    def open_route(path):
        page.goto(BASE + path)
        page.locator('h1').first.wait_for()

    def records():
        return page.evaluate("JSON.parse(localStorage.getItem('procureui.records.v1'))")

    for path, heading in [('/bills/unknown/edit', 'Bill not found'),
                          ('/items/unknown/edit', 'Item not found'),
                          ('/rfqs/unknown/edit', 'Request for Quote not found'),
                          ('/settings/modules/unknown/fields', 'Settings page not found')]:
        open_route(path)
        expect(page.get_by_role('heading', name=heading, exact=True)).to_be_visible()
    print('PASS unknown-ID and settings-route guards', flush=True)

    open_route('/procurement-requests')
    page.get_by_role('link', name=re.compile('PR-00001.*Office equipment')).click()
    page.get_by_role('link', name='Edit', exact=True).click()
    assert 'entry=procurement' in page.url
    page.get_by_role('button', name='Close editor', exact=True).click()
    page.wait_for_url('**/procurement-requests')
    print('PASS procurement editor return context', flush=True)

    open_route('/requests')
    pending_tab = page.get_by_role('tab', name='Pending Requests', exact=True)
    all_requests_tab = page.get_by_role('tab', name='All Requests', exact=True)
    expect(pending_tab).to_have_attribute('aria-selected', 'true')
    expect(page.get_by_label('Request owner scope', exact=True)).to_have_value('mine')
    expect(page.get_by_role('link', name=re.compile('PR-00001'))).to_be_visible()
    expect(page.get_by_role('link', name=re.compile('PR-00002'))).to_have_count(0)
    expect(page.get_by_role('link', name=re.compile('PR-00003'))).to_have_count(0)
    all_requests_tab.click()
    expect(page.get_by_role('link', name=re.compile('PR-00002'))).to_be_visible()
    expect(page.get_by_role('link', name=re.compile('PR-00003'))).to_have_count(0)
    page.get_by_label('Request owner scope', exact=True).select_option('all')
    expect(page.get_by_role('link', name=re.compile('PR-00003'))).to_be_visible()
    expect(page.get_by_text('Another employee', exact=True)).to_be_visible()
    page.reload()
    expect(all_requests_tab).to_have_attribute('aria-selected', 'true')
    expect(page.get_by_label('Request owner scope', exact=True)).to_have_value('all')
    expect(page.get_by_role('link', name=re.compile('PR-00003'))).to_be_visible()
    pending_tab.click()
    expect(page.get_by_role('link', name=re.compile('PR-00003'))).to_be_visible()
    expect(page.get_by_role('link', name=re.compile('PR-00002'))).to_have_count(0)
    page.get_by_label('Request owner scope', exact=True).select_option('mine')
    expect(page.get_by_role('link', name=re.compile('PR-00003'))).to_have_count(0)
    open_route('/procurement-requests')
    expect(page.get_by_label('Request owner scope', exact=True)).to_have_count(0)
    expect(page.get_by_role('link', name=re.compile('PR-00003'))).to_be_visible()
    print('PASS My Requests pending/all tabs, owner scope, persistence, and Procurement separation', flush=True)

    open_route('/inbox')
    page.locator('input[type=file]').set_input_files({'name':'demo-invoice.pdf','mimeType':'application/pdf','buffer':b'demo metadata only'})
    page.get_by_role('link', name=re.compile('Create bill draft')).click()
    expect(page.get_by_text('filename metadata only; no file contents were imported.', exact=False)).to_be_visible()
    expect(page.get_by_label('Transaction Title', exact=True)).to_have_value('demo-invoice')
    expect(page.get_by_role('button', name='Remove demo-invoice.pdf', exact=True)).to_be_attached()
    page.get_by_role('button', name='Save as Draft', exact=True).click()
    page.wait_for_url('**/bills')
    bill_draft = next(r for r in records() if r.get('meta',{}).get('inboxFilename') == 'demo-invoice.pdf')
    assert bill_draft['status'] == 'Draft' and bill_draft['meta']['inboxId'].startswith('INBOX-')
    assert json.loads(bill_draft['meta']['draft'])['files'] == ['demo-invoice.pdf']
    print('PASS intake metadata and incomplete bill draft', flush=True)

    open_route('/vendor-credits/new')
    page.get_by_label('Select a vendor', exact=True).select_option(label='Northstar Office Supply')
    page.get_by_label('Item 1', exact=True).select_option(label='Office chair')
    page.get_by_label('Apply to Bill (optional)', exact=False).select_option('BILL-00001')
    assert page.get_by_label('Due Date', exact=True).count() == 0
    assert page.get_by_label('Terms and Conditions', exact=True).count() == 0
    page.get_by_role('button', name='Save Credit (demo)', exact=True).click()
    page.wait_for_url('**/vendor-credits')
    credit = next(r for r in records() if r['kind'] == 'vendor-credits' and r['status'] == 'Applied (demo)')
    assert credit['amount'] == 1250 and credit['meta']['appliedBillId'] == 'BILL-00001'
    open_route('/payments/new')
    page.get_by_label('Bill to Pay *', exact=False).select_option('BILL-00001')
    expect(page.get_by_label('Amount *', exact=True)).to_have_value('450')
    expect(page.get_by_label('Select a vendor', exact=True)).to_have_value('VEND-001')
    print('PASS credit-specific fields and remaining payment balance', flush=True)

    open_route('/batch-payments')
    page.get_by_label('Select BILL-00001', exact=True).check()
    page.get_by_role('button', name='Review batch (1)', exact=True).click()
    page.get_by_role('button', name='Prepare batch', exact=True).click()
    page.wait_for_url('**/batch-payments/BATCH-*')
    batch = next(r for r in records() if r['kind'] == 'batch-payments')
    assert batch['amount'] == 450
    expect(page.get_by_role('heading', name=batch['title'], exact=True)).to_be_visible()
    open_route('/batch-payments')
    page.get_by_label('Search demo records', exact=True).fill(batch['id'])
    page.get_by_role('link', name=re.compile('^' + re.escape(batch['id']) + r'\s')).click()
    expect(page.get_by_role('heading', name=batch['title'], exact=True)).to_be_visible()
    print('PASS batch balances and global-search detail destination', flush=True)

    open_route('/rfqs/new')
    page.get_by_label('Title *', exact=True).fill('Local resume check')
    page.get_by_label('Description *', exact=True).fill('Fictional sourcing draft')
    page.get_by_role('button', name=re.compile('Save and Next')).click()
    expect(page.get_by_role('heading', name='Items', exact=True)).to_be_visible()
    page.reload()
    expect(page.get_by_role('heading', name='Items', exact=True)).to_be_visible()
    page.get_by_role('button', name='Add item', exact=True).click()
    expect(page.get_by_role('dialog', name='Add item', exact=True)).to_be_visible()
    page.get_by_label('Expected quantity *', exact=False).fill('123')
    expect(page.get_by_label('Expected quantity *', exact=False)).to_have_value('123')
    page.get_by_role('button', name='Cancel', exact=True).click()
    print('PASS RFQ stage resume and modal typing stability', flush=True)

    bill_before_edit = next(r for r in records() if r['id'] == 'BILL-00001')
    open_route('/bills/BILL-00001')
    expect(page.get_by_role('heading', name='Office supplies', exact=True)).to_be_visible()
    page.get_by_role('link', name='Edit', exact=True).click()
    expect(page.get_by_label('Transaction Title', exact=True)).to_have_value('Office supplies')
    page.get_by_role('button', name='Save as Draft', exact=True).click()
    page.wait_for_url('**/bills')
    edited_bill = next(r for r in records() if r['id'] == 'BILL-00001')
    assert edited_bill['amount'] == 1700 and edited_bill['status'] == bill_before_edit['status']
    print('PASS bill detail→edit preserves posted amount and status', flush=True)

    open_route('/vendors/VEND-001')
    for tab in ['Overview', 'Comments', 'Transactions', 'Mails', 'Statement']:
        expect(page.get_by_role('tab', name=re.compile(tab))).to_be_visible()
    page.get_by_role('tab', name='Comments').click()
    page.get_by_role('button', name='Underline', exact=True).click()
    page.get_by_placeholder('Write a comment for this local demo vendor…').fill('Formatting stays local')
    page.get_by_role('button', name='Add Comment', exact=True).click()
    vendor = next(r for r in records() if r['id'] == 'VEND-001')
    assert json.loads(vendor['meta']['comments'])[-1]['format'] == 'underline'
    page.get_by_role('tab', name='Transactions').click()
    po_vendor_row = page.get_by_role('link', name='PO-00001', exact=True)
    expect(po_vendor_row).to_be_visible()
    po_vendor_row.click()
    assert 'fromVendor=VEND-001' in page.url and 'vendorTab=transactions' in page.url
    expect(page.get_by_role('link', name='Purchase Order', exact=True)).to_have_attribute('href', '/vendors/VEND-001/transactions')
    page.get_by_role('link', name='Edit', exact=True).click()
    assert 'fromVendor=VEND-001' in page.url and 'vendorTab=transactions' in page.url
    page.get_by_role('button', name='Close editor', exact=True).click()
    page.wait_for_url('**/vendors/VEND-001/transactions')
    page.get_by_role('tab', name='Statement').click()
    page.get_by_label('Statement filter by', exact=True).select_option('bills')
    expect(page.get_by_text('BILL-00001', exact=True)).to_be_visible()
    print('PASS vendor full detail tabs, linked transactions, local comments, and statement filters', flush=True)

    open_route('/purchase-orders/PO-00001/edit')
    vendor_select = page.get_by_label('Select a vendor', exact=True)
    expect(vendor_select).to_have_value('VEND-001')
    vendor_select.select_option('VEND-002')
    page.get_by_role('button', name='Save as Draft', exact=True).click()
    page.wait_for_url('**/purchase-orders')
    changed_order = next(r for r in records() if r['id'] == 'PO-00001')
    assert changed_order['party'] == 'Copperline Technology'
    assert changed_order['meta']['vendorId'] == 'VEND-002'
    open_route('/vendors/VEND-001/transactions')
    expect(page.get_by_role('link', name='PO-00001', exact=True)).to_have_count(0)
    open_route('/vendors/VEND-002/transactions')
    expect(page.get_by_role('link', name='PO-00001', exact=True)).to_be_visible()
    page.get_by_role('link', name='PO-00001', exact=True).click()
    assert 'fromVendor=VEND-002' in page.url
    page.get_by_role('link', name='Edit', exact=True).click()
    assert 'fromVendor=VEND-002' in page.url
    page.get_by_role('button', name='Close editor', exact=True).click()
    page.wait_for_url('**/vendors/VEND-002/transactions')
    open_route('/purchase-orders/new?vendor=VEND-001')
    expect(page.get_by_label('Select a vendor', exact=True)).to_have_value('VEND-001')
    page.get_by_label('Select a vendor', exact=True).select_option('VEND-003')
    page.get_by_label('Transaction Title', exact=True).fill('Prefilled vendor switch')
    page.get_by_role('button', name='Save as Draft', exact=True).click()
    page.wait_for_url('**/vendors/VEND-001/transactions')
    switched_order = next(r for r in records() if r['title'] == 'Prefilled vendor switch')
    assert switched_order['party'] == 'Atlas Industrial Supplies'
    assert switched_order['meta']['vendorId'] == 'VEND-003'
    print('PASS stable vendor IDs and vendor-tab return context across view/edit', flush=True)

    page.evaluate("""() => {
      const key = 'procureui.records.v1';
      const data = JSON.parse(localStorage.getItem(key) || '[]');
      data.push({ id: 'PAY-ROW-TEST', kind: 'payments', title: 'Test vendor payment',
        party: 'Copperline Technology', date: '2026-10-16', amount: 321,
        status: 'Draft', meta: { vendorId: 'VEND-002', reference: 'PAYREF-42',
          paymentMode: 'Cash', unusedAmount: '25' } });
      localStorage.setItem(key, JSON.stringify(data));
    }""")
    open_route('/vendors/VEND-002/transactions')
    page.get_by_label('Go to transactions', exact=True).select_option('payments')
    payment_row = page.get_by_role('row').filter(has=page.get_by_role('link', name='PAY-ROW-TEST', exact=True))
    expect(payment_row.get_by_role('cell').nth(2)).to_have_text('PAYREF-42')
    expect(payment_row.get_by_role('cell').nth(3)).to_have_text('Cash')
    expect(payment_row.get_by_role('cell').nth(4)).to_contain_text('321')
    expect(payment_row.get_by_role('cell').nth(5)).to_contain_text('25')
    print('PASS vendor payment detail columns map reference, mode, paid, and unused amount', flush=True)

    open_route('/bills/new?vendor=VEND-001')
    expect(page.get_by_label('Select a vendor', exact=True)).to_have_value('VEND-001')
    page.get_by_role('link', name=re.compile('Add a vendor')).click()
    assert '/vendors/new?returnTo=' in page.url
    page.get_by_label('Display Name *', exact=True).fill('Caller Return Vendor')
    page.get_by_role('button', name='Save vendor', exact=True).click()
    page.wait_for_url('**/bills/new?vendor=VEND-001')
    assert any(r['title'] == 'Caller Return Vendor' and r['kind'] == 'vendors' for r in records())
    page.get_by_role('link', name=re.compile('Add a vendor')).click()
    page.get_by_role('link', name='Cancel', exact=True).click()
    page.wait_for_url('**/bills/new?vendor=VEND-001')
    page.get_by_role('button', name='Close editor', exact=True).click()
    page.wait_for_url('**/vendors/VEND-001/transactions')
    print('PASS add-vendor save/cancel returns to the originating transaction draft', flush=True)

    open_route('/vendors/VEND-001')
    page.get_by_role('tab', name='Overview').click()
    page.get_by_role('button', name='Add Bank Account', exact=True).click()
    page.get_by_label('Account Holder Name', exact=True).fill('Demo Holder')
    page.get_by_label('Bank Name', exact=True).fill('Preview Bank')
    page.get_by_label('Account Number', exact=True).fill('12345678')
    page.get_by_label('Re-enter Account Number', exact=True).fill('12345678')
    page.get_by_role('button', name='Save masked label only', exact=True).click()
    vendor = next(r for r in records() if r['id'] == 'VEND-001')
    banks = json.loads(vendor['meta']['bankAccounts'])
    assert '12345678' not in json.dumps(banks) and banks[0]['masked'].endswith('5678')
    page.get_by_role('button', name='Edit bank Preview Bank', exact=True).click()
    page.get_by_label('Bank Name', exact=True).fill('Updated Preview Bank')
    page.get_by_role('button', name='Update masked label only', exact=True).click()
    page.get_by_role('button', name='Remove bank Updated Preview Bank', exact=True).click()
    page.get_by_role('button', name='Delete local record', exact=True).click()
    vendor = next(r for r in records() if r['id'] == 'VEND-001')
    assert json.loads(vendor['meta']['bankAccounts']) == []
    print('PASS nested bank add/edit/delete stores masked labels only', flush=True)

    page.get_by_role('button', name='More', exact=True).click()
    page.get_by_role('menuitem', name='Clone Vendor', exact=True).click()
    clone_id = page.url.split('/vendors/')[1].split('/')[0].split('?')[0]
    assert clone_id != 'VEND-001'
    page.get_by_role('button', name='More', exact=True).click()
    page.get_by_role('menuitem', name='Delete Vendor', exact=True).click()
    page.get_by_role('button', name='Delete local record', exact=True).click()
    page.wait_for_url('**/vendors')
    assert all(r['id'] != clone_id for r in records())
    print('PASS vendor clone and confirmed local delete', flush=True)

    open_route('/vendors/VEND-001/edit')
    for tab in ['Other Details', 'Address', 'Contact Persons', 'Bank Details', 'Custom Fields', 'Reporting Tags', 'Remarks']:
        expect(page.get_by_role('tab', name=tab, exact=True)).to_be_visible()
    page.get_by_role('tab', name='Address', exact=True).click()
    expect(page.get_by_role('heading', name='Billing Address', exact=True)).to_be_visible()
    expect(page.get_by_role('heading', name='Shipping Address', exact=True)).to_be_visible()
    page.get_by_role('tab', name='Contact Persons', exact=True).click()
    page.get_by_role('button', name='Add Contact Person', exact=True).click()
    page.get_by_label('firstName for contact person', exact=True).fill('Local Contact')
    page.get_by_role('button', name='Remove contact person', exact=True).click()
    page.get_by_role('tab', name='Bank Details', exact=True).click()
    expect(page.get_by_text('Bank account details are added from the Vendor Overview page', exact=False)).to_be_visible()
    page.get_by_role('tab', name='Custom Fields', exact=True).click()
    page.get_by_role('button', name='Add Field', exact=True).click()
    page.get_by_label('Field Name', exact=True).fill('Demo ID')
    page.get_by_label('Value', exact=True).fill('Local only')
    page.get_by_role('button', name='Remove custom field', exact=True).click()
    page.get_by_role('tab', name='Reporting Tags', exact=True).click()
    page.get_by_label('Add Reporting Tag', exact=True).fill('Demo Region')
    page.get_by_role('button', name='Add tag', exact=True).click()
    page.get_by_role('button', name='Remove tag Demo Region', exact=True).click()
    page.get_by_role('tab', name='Remarks', exact=True).click()
    expect(page.get_by_label('Remarks (For Internal Use)', exact=True)).to_be_visible()
    print('PASS vendor edit tabs and nested local form controls', flush=True)

    open_route('/items/ITEM-001')
    for tab in ['Overview', 'Transactions', 'History']:
        expect(page.get_by_role('tab', name=tab, exact=True)).to_be_visible()
    page.get_by_role('tab', name='Transactions', exact=True).click()
    page.get_by_label('Item transaction status', exact=True).select_option('Draft')
    expect(page.get_by_role('link', name='PO-00001', exact=True)).to_be_visible()
    print('PASS item detail tabs, stable related-item IDs, and status filter', flush=True)

    open_route(f"/batch-payments/{batch['id']}")
    page.get_by_role('link', name='Edit', exact=True).click()
    expect(page.get_by_role('heading', name='Edit prepared batch', exact=True)).to_be_visible()
    page.get_by_role('button', name='Save changes locally', exact=True).click()
    page.wait_for_url(f"**/batch-payments/{batch['id']}")
    updated_batch = next(r for r in records() if r['id'] == batch['id'])
    assert updated_batch['amount'] == 450
    print('PASS prepared batch full detail→edit route', flush=True)
    open_route('/batch-payments')
    expect(page.get_by_role('link', name=f'View batch {batch["id"]}', exact=True)).to_be_visible()
    expect(page.get_by_role('link', name=f'Edit batch {batch["id"]}', exact=True)).to_be_visible()
    page.get_by_role('button', name=f'Delete batch {batch["id"]}', exact=True).click()
    expect(page.get_by_role('dialog', name='Delete prepared batch?')).to_be_visible()
    page.get_by_role('button', name='Cancel', exact=True).click()
    page.get_by_role('button', name=f'Delete batch {batch["id"]}', exact=True).click()
    page.get_by_role('button', name='Delete local record', exact=True).click()
    assert all(r['id'] != batch['id'] for r in records())
    assert any(r['id'] == 'BILL-00001' for r in records())
    print('PASS prepared batch list exposes View/Edit/Delete with non-cascading local confirmation', flush=True)

    open_route('/vendors')
    page.evaluate("""() => {
      const key = 'procureui.records.v1';
      const data = JSON.parse(localStorage.getItem(key) || '[]');
      const dates = {
        'Northstar Office Supply': ['2024-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'],
        'Copperline Technology': ['2024-03-01T00:00:00.000Z', '2024-03-01T00:00:00.000Z'],
        'Atlas Industrial Supplies': ['2024-02-01T00:00:00.000Z', '2025-08-01T00:00:00.000Z']
      };
      for (const record of data) {
        const times = dates[record.title] || ['2020-01-01T00:00:00.000Z', '2020-01-01T00:00:00.000Z'];
        if (record.kind === 'vendors') {
          record.createdAt = times[0];
          record.lastModifiedAt = times[1];
        }
      }
      localStorage.setItem(key, JSON.stringify(data));
    }""")
    page.reload()
    page.get_by_role('button', name='More Actions', exact=True).click()
    page.get_by_role('menuitem', name='Sort by', exact=True).click()
    page.get_by_role('menuitem', name='Created Time', exact=True).click()
    expect(page.locator('tbody tr').first).to_contain_text('Copperline Technology')
    page.get_by_role('button', name='More Actions', exact=True).click()
    page.get_by_role('menuitem', name='Sort by', exact=True).click()
    page.get_by_role('menuitem', name='Last Modified Time', exact=True).click()
    expect(page.locator('tbody tr').first).to_contain_text('Northstar Office Supply')
    print('PASS vendor Created/Modified sorts use distinct timestamps', flush=True)

    expect(page.get_by_label('Saved list view', exact=True)).to_have_value('Active Vendors')
    page.get_by_role('button', name='Advanced Search Vendors', exact=True).click()
    expect(page.get_by_role('dialog', name='Advanced Search · Vendors')).to_be_visible()
    for field in ['Display Name', 'Company Name', 'First Name', 'Last Name', 'Email', 'Phone', 'Address', 'Notes', 'Status']:
        expect(page.get_by_label(field, exact=True)).to_be_visible()
    page.get_by_label('Company Name', exact=True).fill('Northstar')
    page.get_by_role('button', name='Search', exact=True).click()
    expect(page.get_by_role('link', name='Northstar Office Supply', exact=True)).to_be_visible()
    expect(page.get_by_role('link', name='Copperline Technology', exact=True)).to_have_count(0)
    expect(page.get_by_role('columnheader', name='Actions', exact=True)).to_be_visible()

    page.get_by_role('button', name='Customize columns', exact=True).click()
    expect(page.get_by_role('dialog', name='Customize Vendors columns')).to_be_visible()
    page.get_by_label('Email', exact=True).uncheck()
    page.get_by_label('Width for Company name', exact=True).select_option('120')
    page.get_by_role('button', name='Apply to Preview', exact=True).click()
    expect(page.get_by_role('columnheader', name='Email', exact=True)).to_have_count(0)
    assert page.get_by_role('columnheader', name='Company name', exact=True).evaluate('(el) => el.style.width') == '120px'
    page.get_by_role('button', name='More Actions', exact=True).click()
    page.get_by_role('menuitem', name='Reset Column Width', exact=True).click()
    assert page.get_by_role('columnheader', name='Company name', exact=True).evaluate('(el) => el.style.width') == '140px'

    page.get_by_role('button', name='More Actions', exact=True).click()
    page.get_by_role('menuitem', name='Export', exact=True).click()
    with page.expect_download() as current_export:
        page.get_by_role('menuitem', name='Export Current View', exact=True).click()
    export = current_export.value
    assert export.suggested_filename == 'vendors-current-view.csv'
    export_text = open(export.path(), encoding='utf-8-sig').read()
    assert 'Northstar Office Supply' in export_text and 'Copperline Technology' not in export_text
    assert 'Email' not in export_text.splitlines()[0]

    page.get_by_role('button', name='More Actions', exact=True).click()
    page.get_by_role('menuitem', name='Export', exact=True).click()
    with page.expect_download() as all_export:
        page.get_by_role('menuitem', name='Export Vendors', exact=True).click()
    all_text = open(all_export.value.path(), encoding='utf-8-sig').read()
    assert 'Northstar Office Supply' in all_text and 'Copperline Technology' in all_text
    assert 'Email' in all_text.splitlines()[0]

    page.get_by_label('Select Northstar Office Supply', exact=True).check()
    page.get_by_role('button', name='More Actions', exact=True).click()
    page.get_by_role('menuitem', name='Export', exact=True).click()
    with page.expect_download() as selected_export:
        page.get_by_role('menuitem', name='Export Selected (1)', exact=True).click()
    selected_text = open(selected_export.value.path(), encoding='utf-8-sig').read()
    assert 'Northstar Office Supply' in selected_text and 'Copperline Technology' not in selected_text
    page.get_by_role('button', name='Advanced Search Vendors', exact=True).click()
    page.get_by_label('Company Name', exact=True).fill('Copperline')
    page.get_by_role('button', name='Search', exact=True).click()
    page.get_by_label('Select all visible Vendors', exact=True).check()
    page.get_by_role('button', name='More Actions', exact=True).click()
    page.get_by_role('menuitem', name='Export', exact=True).click()
    expect(page.get_by_role('menuitem', name='Export Selected (2)', exact=True)).to_be_visible()
    page.get_by_role('button', name='More Actions', exact=True).click()
    page.get_by_label('Select Copperline Technology', exact=True).uncheck()
    page.get_by_role('button', name='More Actions', exact=True).click()
    page.get_by_role('menuitem', name='Export', exact=True).click()
    with page.expect_download() as preserved_export:
        page.get_by_role('menuitem', name='Export Selected (1)', exact=True).click()
    preserved_text = open(preserved_export.value.path(), encoding='utf-8-sig').read()
    assert 'Northstar Office Supply' in preserved_text and 'Copperline Technology' not in preserved_text
    print('PASS vendor selection survives filtered select-all and visible-row clearing', flush=True)
    print('PASS vendor advanced search, visible-column export, and column customization', flush=True)

    page.get_by_role('button', name='More Actions', exact=True).click()
    page.get_by_role('menuitem', name='Sort by', exact=True).click()
    expect(page.get_by_role('menuitem', name='Unused Credits (BCY)', exact=True)).to_be_visible()
    page.get_by_role('menuitem', name='Unused Credits (BCY)', exact=True).click()
    page.get_by_role('button', name='More Actions', exact=True).click()
    page.get_by_role('menuitem', name='Preferences', exact=True).click()
    page.wait_for_url('**/settings/modules/vendors/preferences')
    expect(page.get_by_role('heading', name='Vendors', exact=True)).to_be_visible()
    print('PASS vendor More Actions sort and canonical Preferences destination', flush=True)

    open_route('/items')
    page.get_by_role('button', name='Advanced Search Items', exact=True).click()
    expect(page.get_by_role('dialog', name='Advanced Search · Items')).to_be_visible()
    for field in ['Name', 'SKU', 'Purchase Description', 'Purchase Rate', 'Unit', 'Status']:
        expect(page.get_by_label(field, exact=True)).to_be_visible()
    page.get_by_role('button', name='Cancel', exact=True).click()
    page.get_by_role('button', name='More Actions', exact=True).click()
    page.get_by_role('menuitem', name='Import', exact=True).click()
    page.get_by_role('menuitem', name='Import Items', exact=True).click()
    expect(page.get_by_role('dialog', name='Import Items')).to_be_visible()
    page.get_by_label('Choose import file', exact=True).set_input_files({
        'name': 'demo-item-rates.csv', 'mimeType': 'text/csv',
        'buffer': b'Name,SKU,Purchase Rate\nBad Negative,TEST-NEG,-5\nBad Text,TEST-TEXT,not-a-rate\nRate Valid,TEST-GOOD,12.50\n'
    })
    expect(page.get_by_role('button', name='Next', exact=True)).to_be_enabled()
    page.get_by_role('button', name='Next', exact=True).click()
    expect(page.get_by_role('heading', name=re.compile('Map Fields'))).to_be_visible()
    page.get_by_role('button', name='Next', exact=True).click()
    expect(page.get_by_text('1 rows ready for local import', exact=True)).to_be_visible()
    expect(page.get_by_text('2 rows missing required fields or containing invalid values', exact=True)).to_be_visible()
    page.get_by_role('button', name='Import to Local Demo', exact=True).click()
    expect(page.get_by_role('heading', name='Local demo import complete', exact=True)).to_be_visible()
    assert any(r['title'] == 'Rate Valid' and r['amount'] == 12.5 for r in records())
    assert not any(r['title'] in ['Bad Negative', 'Bad Text'] for r in records())
    page.get_by_role('button', name='Done', exact=True).click()
    page.get_by_role('button', name='More Actions', exact=True).click()
    page.get_by_role('menuitem', name='Export', exact=True).click()
    with page.expect_download() as items_export:
        page.get_by_role('menuitem', name='Export Current View', exact=True).click()
    assert items_export.value.suggested_filename == 'items-current-view.csv'
    print('PASS shared Items filters/export and local import rate validation', flush=True)

    open_route('/purchase-orders')
    page.get_by_role('button', name='Advanced Search Purchase Orders', exact=True).click()
    expect(page.get_by_role('dialog', name='Advanced Search · Purchase Orders')).to_be_visible()
    for field in ['Number', 'Description', 'Vendor / Team', 'Date', 'Status', 'Amount']:
        expect(page.get_by_label(field, exact=True)).to_be_visible()
    page.get_by_role('button', name='Cancel', exact=True).click()
    page.get_by_role('button', name='More Actions', exact=True).click()
    page.get_by_role('menuitem', name='Export', exact=True).click()
    with page.expect_download() as po_export:
        page.get_by_role('menuitem', name='Export Current View', exact=True).click()
    assert po_export.value.suggested_filename == 'purchase-orders-current-view.csv'
    print('PASS shared filters, sort, and export on Purchase Orders list', flush=True)

    open_route('/vendors')
    page.get_by_role('button', name='More Actions', exact=True).click()
    page.get_by_role('menuitem', name='Import', exact=True).click()
    page.get_by_role('menuitem', name='Import Vendors', exact=True).click()
    expect(page.get_by_role('dialog', name='Import Vendors')).to_be_visible()
    page.get_by_role('radio').nth(0).check()
    page.get_by_role('button', name='Continue', exact=True).click()
    page.get_by_text('Page Tips', exact=True).click()
    expect(page.get_by_text('Only UTF-8 CSV and TSV files are parsed in this browser-only prototype.', exact=True)).to_be_visible()
    with page.expect_download() as sample_csv:
        page.get_by_role('button', name='Download a sample CSV file', exact=True).click()
    assert sample_csv.value.suggested_filename == 'sample-vendors.csv'
    with page.expect_download() as sample_xls:
        page.get_by_role('button', name='Download a sample XLS file', exact=True).click()
    assert sample_xls.value.suggested_filename == 'sample-vendors.xls'
    page.get_by_label('Save these import settings in this browser for future demo imports', exact=True).check()
    page.get_by_label('Choose import file', exact=True).set_input_files({
        'name': 'demo-vendors.csv', 'mimeType': 'text/csv',
        'buffer': b'Display Name,Company Name,Email,Work Phone\nLocal Import Fixture,Local Supply,local@example.invalid,+260 000 000 000\n'
    })
    page.get_by_role('button', name='Next', exact=True).wait_for(state='visible')
    expect(page.get_by_role('button', name='Next', exact=True)).to_be_enabled()
    page.get_by_role('button', name='Next', exact=True).click()
    expect(page.get_by_role('heading', name=re.compile('Map Fields'))).to_be_visible()
    expect(
        page.get_by_label('Map Company Name', exact=True).locator('option[value="displayName"]')
    ).to_be_disabled()
    page.get_by_role('button', name='Next', exact=True).click()
    expect(page.get_by_text('1 rows ready for local import', exact=True)).to_be_visible()
    page.get_by_role('button', name='Import to Local Demo', exact=True).click()
    expect(page.get_by_role('heading', name='Local demo import complete', exact=True)).to_be_visible()
    imported_vendor = next(r for r in records() if r['title'] == 'Local Import Fixture')
    assert imported_vendor['kind'] == 'vendors'
    assert json.loads(page.evaluate("localStorage.getItem('procureui.import-settings')"))['encoding'] == 'UTF-8 (Unicode)'
    page.get_by_role('button', name='Done', exact=True).click()
    page.get_by_label('Select Local Import Fixture', exact=True).check()
    page.get_by_role('button', name='Delete Local Import Fixture', exact=True).click()
    page.get_by_role('button', name='Delete local record', exact=True).click()
    page.get_by_role('button', name='More Actions', exact=True).click()
    page.get_by_role('menuitem', name='Export', exact=True).click()
    expect(page.get_by_role('menuitem', name=re.compile('Export Selected'))).to_have_count(0)
    page.get_by_role('button', name='More Actions', exact=True).click()
    print('PASS catalog deletion clears selected IDs before export', flush=True)

    open_route('/vendors')
    page.get_by_role('button', name='More Actions', exact=True).click()
    page.get_by_role('menuitem', name='Import', exact=True).click()
    page.get_by_role('menuitem', name='Import Vendors', exact=True).click()
    page.get_by_role('radio').nth(0).check()
    page.get_by_role('button', name='Continue', exact=True).click()
    page.get_by_label('Choose import file', exact=True).set_input_files({
        'name': 'demo-vendors.tsv', 'mimeType': 'text/tab-separated-values',
        'buffer': b'Display Name\tCompany Name\tNotes, Internal\nTSV Demo Vendor\tTSV Supply\tTier 2, local\n'
    })
    expect(page.get_by_role('button', name='Next', exact=True)).to_be_enabled()
    page.get_by_role('button', name='Next', exact=True).click()
    expect(page.get_by_role('heading', name=re.compile('Map Fields'))).to_be_visible()
    expect(page.get_by_label('Map Display Name', exact=True)).to_have_value('displayName')
    expect(page.get_by_label('Map Company Name', exact=True)).to_have_value('company')
    expect(page.get_by_role('row').filter(has_text='Notes, Internal')).to_contain_text('Tier 2, local')
    page.get_by_role('button', name='Cancel', exact=True).click()
    print('PASS TSV import delimiter follows file type and preserves commas', flush=True)

    open_route('/vendors')
    page.get_by_role('button', name='More Actions', exact=True).click()
    page.get_by_role('menuitem', name='Import', exact=True).click()
    page.get_by_role('menuitem', name='Import Vendors', exact=True).click()
    page.get_by_role('radio').nth(1).check()
    page.get_by_role('button', name='Continue', exact=True).click()
    page.get_by_label('Choose import file', exact=True).set_input_files({
        'name': 'demo-contacts.csv', 'mimeType': 'text/csv',
        'buffer': b'Vendor Name,First Name,Last Name,Email,Work Phone\nNorthstar Office Supply,Local,Contact,local.contact@example.invalid,+260 000 000 001\n'
    })
    expect(page.get_by_role('button', name='Next', exact=True)).to_be_enabled()
    page.get_by_role('button', name='Next', exact=True).click()
    page.get_by_role('button', name='Next', exact=True).click()
    page.get_by_role('button', name='Import to Local Demo', exact=True).click()
    contacts = json.loads(next(r for r in records() if r['id'] == 'VEND-001')['meta']['contactPersons'])
    assert any(c['email'] == 'local.contact@example.invalid' for c in contacts)
    assert len(contacts) == 1
    original_contact_id = contacts[0]['id']
    page.get_by_role('button', name='Done', exact=True).click()

    def import_contact_file(filename, content, duplicate_mode):
        open_route('/vendors')
        page.get_by_role('button', name='More Actions', exact=True).click()
        page.get_by_role('menuitem', name='Import', exact=True).click()
        page.get_by_role('menuitem', name='Import Vendors', exact=True).click()
        page.get_by_role('radio').nth(1).check()
        page.get_by_role('button', name='Continue', exact=True).click()
        mode_index = {
            'Skip Duplicates': 0,
            'Overwrite contact persons': 1,
            'Add duplicates as new contact persons': 2,
        }[duplicate_mode]
        page.get_by_role('radio').nth(mode_index).check()
        page.get_by_label('Choose import file', exact=True).set_input_files({
            'name': filename, 'mimeType': 'text/csv', 'buffer': content
        })
        expect(page.get_by_role('button', name='Next', exact=True)).to_be_enabled()
        page.get_by_role('button', name='Next', exact=True).click()
        page.get_by_role('button', name='Next', exact=True).click()
        page.get_by_role('button', name='Import to Local Demo', exact=True).click()
        page.get_by_role('button', name='Done', exact=True).click()

    add_contact = b'Vendor Name,First Name,Last Name,Email,Work Phone\nNorthstar Office Supply,Added,Copy,local.contact@example.invalid,+260 000 000 001\n'
    import_contact_file('contact-add.csv', add_contact, 'Add duplicates as new contact persons')
    contacts = json.loads(next(r for r in records() if r['id'] == 'VEND-001')['meta']['contactPersons'])
    assert len(contacts) == 2 and any(c['id'] == original_contact_id and c['firstName'] == 'Local' for c in contacts)
    assert any(c['firstName'] == 'Added' for c in contacts)

    overwrite_contact = b'Vendor Name,First Name,Last Name,Email,Work Phone\nNorthstar Office Supply,Overwritten,Contact,local.contact@example.invalid,+260 000 000 001\n'
    import_contact_file('contact-overwrite.csv', overwrite_contact, 'Overwrite contact persons')
    contacts = json.loads(next(r for r in records() if r['id'] == 'VEND-001')['meta']['contactPersons'])
    assert len(contacts) == 2 and any(c['id'] == original_contact_id and c['firstName'] == 'Overwritten' for c in contacts)

    skip_contact = b'Vendor Name,First Name,Last Name,Email,Work Phone\nNorthstar Office Supply,Should,Skip,local.contact@example.invalid,+260 000 000 001\n'
    import_contact_file('contact-skip.csv', skip_contact, 'Skip Duplicates')
    contacts = json.loads(next(r for r in records() if r['id'] == 'VEND-001')['meta']['contactPersons'])
    assert len(contacts) == 2 and not any(c['firstName'] == 'Should' for c in contacts)

    no_email_duplicate = b'Vendor Name,First Name,Last Name,Work Phone\nNorthstar Office Supply,Overwritten,Contact,+260 000 000 001\n'
    import_contact_file('contact-no-email.csv', no_email_duplicate, 'Skip Duplicates')
    contacts = json.loads(next(r for r in records() if r['id'] == 'VEND-001')['meta']['contactPersons'])
    assert len(contacts) == 2 and not any(c['email'] == '' for c in contacts)
    print('PASS contact Skip/Overwrite/Add modes and no-email duplicate matching', flush=True)

    page.evaluate("""() => {
      const key = 'procureui.records.v1';
      const data = JSON.parse(localStorage.getItem(key) || '[]').filter(r => !['Local Import Fixture', 'Rate Valid'].includes(r.title));
      const vendor = data.find(r => r.id === 'VEND-001');
      if (vendor) vendor.meta.contactPersons = '[]';
      localStorage.setItem(key, JSON.stringify(data));
      localStorage.removeItem('procureui.import-settings');
    }""")
    page.reload()
    print('PASS local vendor/contact import wizard, mappings, duplicate settings, and no-live-data boundary', flush=True)

    assert not errors, errors
    print('PASS no page exceptions during focused regressions', flush=True)
    mobile = browser.new_page(viewport={'width': 390, 'height': 844})
    mobile_errors = []
    mobile.on('pageerror', lambda err: mobile_errors.append(str(err)))
    mobile.goto(BASE + '/vendors')
    view_action = mobile.get_by_role('link', name='View Northstar Office Supply', exact=True)
    expect(view_action).to_be_visible()
    action_box = view_action.bounding_box()
    assert action_box and action_box['x'] >= 0 and action_box['x'] + action_box['width'] <= 390
    mobile.get_by_role('button', name='More Actions', exact=True).click()
    menu_box = mobile.get_by_role('menu', name='Vendors list actions').bounding_box()
    assert menu_box and menu_box['x'] >= 0 and menu_box['x'] + menu_box['width'] <= 390
    assert not mobile_errors, mobile_errors
    print('PASS mobile list keeps CRUD actions and menus inside the viewport', flush=True)
    browser.close()
