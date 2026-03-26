/**
 * api/book.js — Vercel Serverless Function
 * Receives a booking from the website and creates an appointment in GHL.
 * Attempts to find/create a contact first; falls back to inline contact fields.
 */

const BASE_URL = 'https://services.leadconnectorhq.com';

const CALENDAR_MAP = {
  'Oil Change':        process.env.GHL_CALENDAR_OIL_CHANGE,
  'Brake Inspection':  process.env.GHL_CALENDAR_BRAKE_INSPECTION,
  'Leak Inspection':   process.env.GHL_CALENDAR_LEAK_INSPECTION,
  'Trip Check':        process.env.GHL_CALENDAR_TRIP_CHECK,
};

function ghlHeaders() {
  return {
    Authorization: `Bearer ${process.env.GHL_API_TOKEN}`,
    'Content-Type': 'application/json',
    Version: '2021-04-15',
    'location-id': process.env.GHL_LOCATION_ID,
  };
}

/**
 * Convert a date string ("2026-03-28") and time string ("10:00 AM")
 * into ISO 8601 start/end timestamps (30 min duration).
 */
function buildTimes(dateStr, timeStr) {
  const [time, period] = timeStr.trim().split(' ');
  let [hours, minutes] = time.split(':').map(Number);
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;

  const start = new Date(`${dateStr}T00:00:00`);
  start.setHours(hours, minutes, 0, 0);
  const end = new Date(start.getTime() + 30 * 60 * 1000);

  return {
    startTime: start.toISOString(),
    endTime: end.toISOString(),
  };
}

/**
 * Try to find an existing GHL contact by email, or create a new one.
 * Returns contactId string, or null if unavailable (scope issue etc).
 */
async function findOrCreateContact({ firstName, lastName, email, phone, locationId }) {
  // Search first
  try {
    const searchRes = await fetch(
      `${BASE_URL}/contacts/?locationId=${locationId}&query=${encodeURIComponent(email)}`,
      { headers: ghlHeaders() }
    );
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      if (searchData.contacts && searchData.contacts.length > 0) {
        return searchData.contacts[0].id;
      }
    }
  } catch (_) {}

  // Create if not found
  const createRes = await fetch(`${BASE_URL}/contacts/`, {
    method: 'POST',
    headers: ghlHeaders(),
    body: JSON.stringify({ locationId, firstName, lastName, email, phone }),
  });

  const createData = await createRes.json();
  if (!createRes.ok) {
    // Return null so caller can fall back to inline contact fields
    console.error('Contact creation failed:', JSON.stringify(createData));
    return null;
  }

  return createData.contact.id;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { service, date, time, vehicle, contact } = req.body;

    if (!service || !date || !time || !contact?.email) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const calendarId = CALENDAR_MAP[service];
    if (!calendarId) {
      return res.status(400).json({ error: `Unknown service: ${service}` });
    }

    const nameParts = (contact.name || '').trim().split(' ');
    const firstName = nameParts[0] || 'Unknown';
    const lastName = nameParts.slice(1).join(' ') || '';

    const { startTime, endTime } = buildTimes(date, time);

    const notes = [
      vehicle.year    && `Year: ${vehicle.year}`,
      vehicle.make    && `Make: ${vehicle.make}`,
      vehicle.model   && `Model: ${vehicle.model}`,
      vehicle.mileage && `Mileage: ${vehicle.mileage}`,
      vehicle.notes   && `Notes: ${vehicle.notes}`,
    ].filter(Boolean).join('\n');

    // Try to get a contactId — non-fatal if it fails
    const contactId = await findOrCreateContact({
      firstName,
      lastName,
      email: contact.email,
      phone: contact.phone || '',
      locationId: process.env.GHL_LOCATION_ID,
    });

    // Build appointment body
    const apptBody = {
      calendarId,
      locationId: process.env.GHL_LOCATION_ID,
      startTime,
      endTime,
      title: `${contact.name} — ${service}`,
      appointmentStatus: 'confirmed',
      notes,
    };

    // Use contactId if we got one; otherwise pass inline contact fields
    if (contactId) {
      apptBody.contactId = contactId;
    } else {
      apptBody.email     = contact.email;
      apptBody.phone     = contact.phone || '';
      apptBody.firstName = firstName;
      apptBody.lastName  = lastName;
    }

    const apptRes = await fetch(`${BASE_URL}/calendars/events/appointments`, {
      method: 'POST',
      headers: ghlHeaders(),
      body: JSON.stringify(apptBody),
    });

    const apptData = await apptRes.json();
    if (!apptRes.ok) {
      throw new Error(`Failed to create appointment: ${JSON.stringify(apptData)}`);
    }

    const appointment = apptData.appointment || apptData;
    return res.status(200).json({ success: true, appointmentId: appointment.id });

  } catch (err) {
    console.error('Booking error:', err);
    return res.status(500).json({ error: err.message || 'Booking failed. Please call us directly.' });
  }
}
