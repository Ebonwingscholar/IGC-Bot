const fs = require('fs');
const path = require('path');

// Path to your events JSON data file
const eventsFilePath = path.join(__dirname, '..', 'data', 'events.json');

/**
 * Loads the events array from the JSON file.
 * Returns an empty array if the file doesn't exist or on error.
 */
function loadEvents() {
  try {
    if (!fs.existsSync(eventsFilePath)) {
      return [];  // No events yet
    }
    const data = fs.readFileSync(eventsFilePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading events:', error);
    return [];
  }
}

/**
 * Saves the given events array to the JSON file.
 */
function saveEvents(events) {
  try {
    const json = JSON.stringify(events, null, 2);
    fs.writeFileSync(eventsFilePath, json, 'utf-8');
  } catch (error) {
    console.error('Error saving events:', error);
  }
}

module.exports = {
  loadEvents,
  saveEvents,
};