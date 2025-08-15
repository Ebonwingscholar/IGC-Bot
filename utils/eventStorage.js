const fs = require('fs');
const path = require('path');

const eventsFilePath = path.join(__dirname, '..', 'data', 'events.json');

function ensureDataDir() {
  const dir = path.dirname(eventsFilePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadEvents() {
  try {
    if (!fs.existsSync(eventsFilePath)) return [];
    const raw = fs.readFileSync(eventsFilePath, 'utf-8');
    const events = JSON.parse(raw);
    // Normalize shape
    for (const ev of events) {
      if (!Array.isArray(ev.bookings)) ev.bookings = [];
      if (typeof ev.active === 'undefined') ev.active = true;
    }
    return events;
  } catch (err) {
    console.error('Error loading events:', err);
    return [];
  }
}

function saveEvents(events) {
  try {
    ensureDataDir();
    fs.writeFileSync(eventsFilePath, JSON.stringify(events, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving events:', err);
  }
}

function getEvents() {
  return loadEvents();
}

function getEventByName(name) {
  const events = loadEvents();
  return events.find(e => e.name.toLowerCase() === String(name).toLowerCase()) || null;
}

function deleteEvent(name) {
  const events = loadEvents();
  const idx = events.findIndex(e => e.name.toLowerCase() === String(name).toLowerCase());
  if (idx === -1) return false;
  events.splice(idx, 1);
  saveEvents(events);
  return true;
}

function addBooking(eventName, booking) {
  const events = loadEvents();
  const ev = events.find(e => e.name.toLowerCase() === String(eventName).toLowerCase());
  if (!ev) return false;
  if (!Array.isArray(ev.bookings)) ev.bookings = [];
  ev.bookings.push(booking);
  saveEvents(events);
  return true;
}

function getBookingByUserAndEvent(userId, eventName) {
  const ev = getEventByName(eventName);
  if (!ev || !Array.isArray(ev.bookings)) return null;
  return ev.bookings.find(b => b.userId === userId) || null;
}

function removeBookingByUserAndEvent(userId, eventName) {
  const events = loadEvents();
  const idx = events.findIndex(e => e.name.toLowerCase() === String(eventName).toLowerCase());
  if (idx === -1) return false;

  const before = events[idx].bookings?.length || 0;
  events[idx].bookings = (events[idx].bookings || []).filter(b => b.userId !== userId);
  const after = events[idx].bookings.length;

  if (after !== before) {
    saveEvents(events);
    return true;
  }
  return false;
}

module.exports = {
  // existing API
  loadEvents,
  saveEvents,
  // new helpers used by your commands
  getEvents,
  getEventByName,
  deleteEvent,
  addBooking,
  getBookingByUserAndEvent,
  removeBookingByUserAndEvent,
};