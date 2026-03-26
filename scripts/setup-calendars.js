/**
 * setup-calendars.js
 * Run once to create the 4 service calendars in GoHighLevel.
 * Usage: node scripts/setup-calendars.js
 *
 * After running, copy the calendar IDs printed below into your .env file.
 */

require('dotenv').config();

const GHL_TOKEN = process.env.GHL_API_TOKEN;
const LOCATION_ID = process.env.GHL_LOCATION_ID;
const BASE_URL = 'https://services.leadconnectorhq.com';

if (!GHL_TOKEN || !LOCATION_ID) {
  console.error('Missing GHL_API_TOKEN or GHL_LOCATION_ID in .env');
  process.exit(1);
}

const SERVICES = [
  {
    name: 'Oil Change',
    description: 'Standard oil change service — 30 minute appointment',
    slug: 'larrys-oil-change',
    color: '#0072CE',
  },
  {
    name: 'Brake Inspection',
    description: 'Free brake inspection — 30 minute appointment',
    slug: 'larrys-brake-inspection',
    color: '#D41E2D',
  },
  {
    name: 'Leak Inspection',
    description: 'Free leak inspection — 30 minute appointment',
    slug: 'larrys-leak-inspection',
    color: '#F59E0B',
  },
  {
    name: 'Trip Check',
    description: 'Free trip check — 30 minute appointment',
    slug: 'larrys-trip-check',
    color: '#10B981',
  },
];

async function createCalendar(service) {
  const body = {
    locationId: LOCATION_ID,
    name: service.name,
    description: service.description,
    slug: service.slug,
    calendarType: 'event',
    isActive: true,
    slotDuration: 30,
    slotDurationUnit: 'mins',
    slotInterval: 30,
    slotIntervalUnit: 'mins',
    slotBuffer: 0,
    appoinmentPerSlot: 1,
    autoConfirm: true,
    allowReschedule: true,
    allowCancellation: true,
    eventColor: service.color,
    eventTitle: '{{contact.name}} - ' + service.name,
    formSubmitType: 'ThankYouMessage',
    formSubmitThanksMessage: 'Your appointment has been booked! We will see you soon.',
    // Mon–Sat open hours (0=Sun,1=Mon,...,6=Sat) — one entry per day
    availabilityType: 0,
    openHours: [
      { daysOfTheWeek: [1], hours: [{ openHour: 8, openMinute: 0, closeHour: 17, closeMinute: 0 }] },
      { daysOfTheWeek: [2], hours: [{ openHour: 8, openMinute: 0, closeHour: 17, closeMinute: 0 }] },
      { daysOfTheWeek: [3], hours: [{ openHour: 8, openMinute: 0, closeHour: 17, closeMinute: 0 }] },
      { daysOfTheWeek: [4], hours: [{ openHour: 8, openMinute: 0, closeHour: 17, closeMinute: 0 }] },
      { daysOfTheWeek: [5], hours: [{ openHour: 8, openMinute: 0, closeHour: 17, closeMinute: 0 }] },
      { daysOfTheWeek: [6], hours: [{ openHour: 8, openMinute: 0, closeHour: 16, closeMinute: 0 }] },
    ],
  };

  const res = await fetch(`${BASE_URL}/calendars/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GHL_TOKEN}`,
      'Content-Type': 'application/json',
      Version: '2021-04-15',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error(`Failed to create "${service.name}":`, JSON.stringify(data, null, 2));
    return null;
  }

  return data.calendar;
}

async function main() {
  console.log('Creating GHL calendars for Larry\'s Chevron...\n');

  const results = [];
  for (const service of SERVICES) {
    process.stdout.write(`Creating "${service.name}"... `);
    const calendar = await createCalendar(service);
    if (calendar) {
      console.log(`Done. ID: ${calendar.id}`);
      results.push({ service: service.name, id: calendar.id });
    }
  }

  console.log('\n========================================');
  console.log('Add these lines to your .env file:');
  console.log('========================================');
  for (const r of results) {
    const envKey = 'GHL_CALENDAR_' + r.service.replace(/\s+/g, '_').toUpperCase();
    console.log(`${envKey}=${r.id}`);
  }
  console.log('========================================\n');
}

main();
