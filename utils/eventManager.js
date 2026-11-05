const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../data/event-bookings.json');

function ensureDataExists() {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, JSON.stringify({}, null, 2));
}

function getData() {
    ensureDataExists();
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return {};
    }
}

function saveData(data) {
    ensureDataExists();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

const MAX_TABLES = 12; // Total physical club tables

module.exports = {
    MAX_TABLES,

    getEventData(dateStr) {
        const data = getData();
        if (!data[dateStr]) {
            data[dateStr] = { tables: {} };
            for (let i = 1; i <= MAX_TABLES; i++) {
                data[dateStr].tables[i] = { am: null, pm: null };
            }
            saveData(data);
        }
        return data[dateStr];
    },

    // Find an available table based on slot type (AM, PM, or Whole Day)
    findAvailableTable(dateStr, slot) {
        const event = this.getEventData(dateStr);
        const tables = event.tables;

        for (let i = 1; i <= MAX_TABLES; i++) {
            const t = tables[i];
            if (slot === 'Whole Day') {
                if (!t.am && !t.pm) return i;
            } else if (slot === 'AM') {
                if (!t.am) return i;
            } else if (slot === 'PM') {
                if (!t.pm) return i;
            }
        }
        return null;
    },

    // Get list of tables that have open slots available to join (under 8 players)
    getJoinableTables(dateStr, slot) {
        const event = this.getEventData(dateStr);
        const joinable = [];

        for (let i = 1; i <= MAX_TABLES; i++) {
            const t = event.tables[i];
            const targetSlotData = (slot === 'Whole Day') ? (t.am || t.pm) : t[slot.toLowerCase()];

            if (targetSlotData && targetSlotData.players.length < targetSlotData.maxPlayers) {
                joinable.push({
                    tableNumber: i,
                    gameName: targetSlotData.gameName,
                    slot: slot,
                    currentPlayers: targetSlotData.players.length,
                    maxPlayers: targetSlotData.maxPlayers,
                    organizer: targetSlotData.organizerName
                });
            }
        }
        return joinable;
    },

    // Create a new game/table booking
    createBooking(dateStr, slot, userId, userName, gameName, maxPlayers) {
        const event = this.getEventData(dateStr);
        const tableNum = this.findAvailableTable(dateStr, slot);

        if (!tableNum) throw new Error(`Sorry, all tables are fully booked for ${slot} on this date!`);

        const slotData = {
            organizerId: userId,
            organizerName: userName,
            gameName: gameName,
            maxPlayers: parseInt(maxPlayers) || 8,
            players: [{ id: userId, name: userName }]
        };

        if (slot === 'Whole Day') {
            event.tables[tableNum].am = slotData;
            event.tables[tableNum].pm = slotData;
        } else {
            event.tables[tableNum][slot.toLowerCase()] = slotData;
        }

        saveData({ ...getData(), [dateStr]: event });
        return tableNum;
    },

    // Join an existing game table
    joinBooking(dateStr, tableNumber, slot, userId, userName) {
        const event = this.getEventData(dateStr);
        const t = event.tables[tableNumber];
        const slotKey = slot === 'Whole Day' ? (t.am ? 'am' : 'pm') : slot.toLowerCase();
        const slotData = t[slotKey];

        if (!slotData) throw new Error('This table slot is no longer active.');
        if (slotData.players.some(p => p.id === userId)) throw new Error('You are already registered on this table.');
        if (slotData.players.length >= slotData.maxPlayers) throw new Error('This table is already at maximum capacity (8 players).');

        slotData.players.push({ id: userId, name: userName });

        if (slot === 'Whole Day') {
            t.am = slotData;
            t.pm = slotData;
        }

        saveData({ ...getData(), [dateStr]: event });
        return slotData;
    }
};
