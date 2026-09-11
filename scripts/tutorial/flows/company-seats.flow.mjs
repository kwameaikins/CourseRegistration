// A company filling the seats it has bought.
//
// WHY THIS IS WORTH A VIDEO: there is no public corporate sign-up. Staff
// create the allocation, and the buyer is then expected to find a separate
// portal, log in with a PIN, and discover that employees are added by PASTING
// A SPREADSHEET COLUMN ORDER into a text box. Nobody works that out unaided,
// and the person stuck is the one who has already paid for ten seats.
//
// The column order is the whole point of the video, and it is worth being
// exact about it, because the on-screen hint and the parser disagree. The hint
// reads:
//
//   FirstName,Surname,Gender(Male/Female),Email,Phone
//
// The parser accepts two more, optional, after those five: job title and
// company. It also coerces gender — anything that is not exactly "Female"
// becomes "Male" — so the narration tells the viewer to write it out in full
// rather than leaving them to find that out from a wrong record.

const ALLOCATION_ID = '00000000-0000-4000-8000-0000000000d1';

function allocation(seatsUsed, employees) {
  return {
    id: ALLOCATION_ID,
    courseName: 'Preparing For Tax Audit',
    batchCohortLabel: 'SEP-2026',
    seatsPurchased: 5,
    seatsUsed,
    seatsRemaining: 5 - seatsUsed,
    pricePerSeat: 800,
    status: 'active',
    employees,
  };
}

const EXISTING = [
  {
    registrationId: '00000000-0000-4000-8000-0000000000e1',
    fullName: 'Yaw Danso',
    email: 'yaw.danso@example.com',
    phone: '+233201110001',
    paymentStatus: 'Paid',
    amountPaid: 800,
    courseFee: 800,
  },
  {
    registrationId: '00000000-0000-4000-8000-0000000000e2',
    fullName: 'Akosua Frimpong',
    email: 'akosua.frimpong@example.com',
    phone: '+233201110002',
    paymentStatus: 'Paid',
    amountPaid: 800,
    courseFee: 800,
  },
];

const ADDED = [
  ...EXISTING,
  {
    registrationId: '00000000-0000-4000-8000-0000000000e3',
    fullName: 'Kofi Mensah',
    email: 'kofi.mensah@example.com',
    phone: '+233241234567',
    paymentStatus: 'Paid',
    amountPaid: 800,
    courseFee: 800,
  },
  {
    registrationId: '00000000-0000-4000-8000-0000000000e4',
    fullName: 'Efua Owusu',
    email: 'efua.owusu@example.com',
    phone: '+233241234568',
    paymentStatus: 'Paid',
    amountPaid: 800,
    courseFee: 800,
  },
];

function company(alloc) {
  return {
    data: {
      companyName: 'Accra Trust Bank',
      billingContactName: 'Ama Boateng',
      billingEmail: 'finance@accratrust.example.com',
      mustChangePin: false,
      allocations: [alloc],
    },
    error: null,
  };
}

const companySeatsFlow = {
  id: 'company-seats',
  title: 'Filling Your Company’s Seats',
  subtitle: 'Knowsia · Corporate',
  path: '/company-portal/login',

  prewarm: ['/company-portal'],
  ready: { selector: '#billingEmail' },

  mocks: [
    { url: '**/api/company-portal/login', json: { data: { mustChangePin: false }, error: null } },
    // Two employees before the paste, four after — the dashboard re-loads on
    // success, so the seats-remaining tile changes on screen without any row
    // being written.
    {
      url: '**/api/company-portal/me',
      sequence: [company(allocation(2, EXISTING)), company(allocation(4, ADDED))],
    },
    {
      url: '**/api/company-portal/allocations/*/employees',
      json: {
        data: {
          results: [
            { index: 0, email: 'kofi.mensah@example.com', status: 'created' },
            { index: 1, email: 'efua.owusu@example.com', status: 'created' },
          ],
          summary: { created: 2, duplicates: 0, errors: 0 },
        },
        error: null,
      },
    },
  ],

  steps: [
    {
      id: 'login',
      does: 'Types the billing email address and the four-digit PIN into the company portal login, then logs in.',
      narrate:
        'A company signs in with its billing email and a four digit PIN, not a password.',
      async run(ui) {
        await ui.type('#billingEmail', 'finance@accratrust.example.com');
        await ui.type('#pin', '4321');
        await ui.clearHighlight();
        await ui.click('button[type="submit"]');
        await ui.page.waitForURL('**/company-portal');
        await ui.page.waitForSelector('button:has-text("Seat Allocations")', { timeout: 20_000 });
        await ui.pause(1100);
      },
    },
    {
      id: 'seats',
      does: 'Shows the overview, where tiles report the seats purchased, the seats filled and the seats still remaining.',
      narrate:
        'The overview tells you how many seats you bought, how many are filled, and how many are left.',
      async run(ui) {
        await ui.highlight('.stat-tile.warn');
        await ui.pause(1400);
        await ui.clearHighlight();
      },
    },
    {
      id: 'allocations',
      does: 'Opens the Seat Allocations section, which lists each block of seats bought with the employees already registered against it.',
      narrate:
        'Seat Allocations lists each block you bought, and everyone already registered against it.',
      async run(ui) {
        await ui.click('button:has-text("Seat Allocations")');
        await ui.clearHighlight();
        await ui.pause(1100);
      },
    },
    {
      id: 'open-box',
      does: 'Clicks Add employees, which opens a box for pasting one employee per line and states the column order and the seats still available.',
      narrate:
        'Add employees opens a box you paste into. One employee a line, in the order it shows you.',
      async run(ui) {
        await ui.click('button:has-text("Add employees")');
        await ui.clearHighlight();
        await ui.highlight('.plan-box-label');
        await ui.pause(1500);
        await ui.clearHighlight();
      },
    },
    {
      id: 'paste',
      does: 'Types two employees into the box, each line giving first name, surname, gender written out in full, email address and phone number.',
      narrate:
        'Paste straight from your spreadsheet. Write gender out in full, as Male or Female.',
      async run(ui) {
        await ui.type(
          '.plan-box textarea',
          'Kofi,Mensah,Male,kofi.mensah@example.com,+233241234567\nEfua,Owusu,Female,efua.owusu@example.com,+233241234568',
        );
        await ui.clearHighlight();
        await ui.pause(600);
      },
    },
    {
      id: 'add',
      does: 'Clicks Add. The two employees appear against the allocation and the seats remaining figure drops from three to one.',
      narrate:
        'Add them, and they are registered against your seats. The seats remaining figure drops as you go.',
      async run(ui) {
        await ui.click('.plan-box button:has-text("Add")');
        await ui.clearHighlight();
        await ui.page.getByText('Kofi Mensah', { exact: false }).first().waitFor({ timeout: 20_000 });
        await ui.pause(1600);
      },
    },
  ],
};

export default companySeatsFlow;
