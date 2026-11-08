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

    // Get list of upcoming events created by admins
    getUpcomingEvents() {
        const data = getData();
        const today = new Date().toISOString().split('T')[0];
        const upcoming = [];

        for (const [dateStr, eventObj] of Object.entries(data)) {
            if (dateStr >= today && eventObj.eventName) {
                upcoming.push({
                    value: dateStr,
                    label: `${eventObj.eventName} (${dateStr})`,
                    eventName: eventObj.eventName
                });
            }
        }

        // Sort chronologically
        upcoming.sort((a, b) => a.value.localeCompare(b.value));
        return upcoming;
    },

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

    // Create a new game/table booking (Updated to accept initialRoster)
    createBooking(dateStr, slot, userId, userName, gameName, maxPlayers, initialRoster = null) {
        const event = this.getEventData(dateStr);
        const tableNum = this.findAvailableTable(dateStr, slot);

        if (!tableNum) throw new Error(`Sorry, all tables are fully booked for ${slot} on this date!`);

        // Use passed initialRoster if provided, otherwise default to just the organizer
        const finalPlayers = (initialRoster && initialRoster.length > 0)
            ? initialRoster
            : [{ id: userId, name: userName }];

        const slotData = {
            organizerId: userId,
            organizerName: userName,
            gameName: gameName,
            maxPlayers: parseInt(maxPlayers) || 8,
            players: finalPlayers
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
    },

    // Admin: Add a player to a table slot roster (Fixed to respect AM/PM separation)
    adminAddPlayer(dateStr, tableNumber, slot, userId, userName) {
        const event = this.getEventData(dateStr);
        const t = event.tables[tableNumber];
        if (!t) throw new Error(`Table ${tableNumber} does not exist.`);
        
        const slotKey = slot.toLowerCase();
        const isUnifiedWholeDay = (slotKey === 'whole day') || (t.am && t.pm && t.am.organizerId === t.pm.organizerId && t.am.gameName === t.pm.gameName);
        const targetSlotData = (slotKey === 'whole day') ? (t.am || t.pm) : t[slotKey];
        
        if (!targetSlotData) throw new Error(`Table ${tableNumber} is not currently booked for ${slot}.`);

        if (targetSlotData.players.some(p => p.id === userId)) {
            throw new Error('This user is already on the roster for this table slot.');
        }

        targetSlotData.players.push({ id: userId, name: userName });

        if (isUnifiedWholeDay) {
            if (t.am) t.am = targetSlotData;
            if (t.pm) t.pm = targetSlotData;
        } else {
            t[slotKey] = targetSlotData;
        }

        saveData({ ...getData(), [dateStr]: event });
        return targetSlotData;
    },

    // Admin: Remove a player from a table slot roster (Fixed to protect independent AM/PM slots)
    adminRemovePlayer(dateStr, tableNumber, slot, targetUserId) {
        const event = this.getEventData(dateStr);
        const t = event.tables[tableNumber];
        if (!t) throw new Error(`Table ${tableNumber} does not exist.`);

        const slotKey = slot.toLowerCase();
        const isUnifiedWholeDay = (slotKey === 'whole day') || (t.am && t.pm && t.am.organizerId === t.pm.organizerId && t.am.gameName === t.pm.gameName);
        const targetSlotData = (slotKey === 'whole day') ? (t.am || t.pm) : t[slotKey];
        
        if (!targetSlotData) throw new Error(`Table ${tableNumber} is not currently booked for ${slot}.`);

        const initialCount = targetSlotData.players.length;
        targetSlotData.players = targetSlotData.players.filter(p => p.id !== targetUserId);

        if (targetSlotData.players.length === initialCount) {
            throw new Error('Player was not found on this table roster.');
        }

        // Update organizer if the organizer was removed
        if (targetSlotData.organizerId === targetUserId) {
            if (targetSlotData.players.length > 0) {
                targetSlotData.organizerId = targetSlotData.players[0].id;
                targetSlotData.organizerName = targetSlotData.players[0].name;
            } else {
                // If roster is empty, free only the specific slot
                if (isUnifiedWholeDay) {
                    t.am = null;
                    t.pm = null;
                } else {
                    t[slotKey] = null;
                }
                saveData({ ...getData(), [dateStr]: event });
                return { freed: true };
            }
        }

        if (isUnifiedWholeDay) {
            if (t.am) t.am = targetSlotData;
            if (t.pm) t.pm = targetSlotData;
        } else {
            t[slotKey] = targetSlotData;
        }

        saveData({ ...getData(), [dateStr]: event });
        return { freed: false, slotData: targetSlotData };
    },

    // Admin: Update game name and capacity for a table slot (Fixed for isolated slots)
    adminUpdateDetails(dateStr, tableNumber, slot, gameName, maxPlayers) {
        const event = this.getEventData(dateStr);
        const t = event.tables[tableNumber];
        if (!t) throw new Error(`Table ${tableNumber} does not exist.`);

        const slotKey = slot.toLowerCase();
        const isUnifiedWholeDay = (slotKey === 'whole day') || (t.am && t.pm && t.am.organizerId === t.pm.organizerId && t.am.gameName === t.pm.gameName);
        const targetSlotData = (slotKey === 'whole day') ? (t.am || t.pm) : t[slotKey];

        if (!targetSlotData) throw new Error(`Table ${tableNumber} is not currently booked for ${slot}.`);

        if (gameName) targetSlotData.gameName = gameName;
        if (maxPlayers) targetSlotData.maxPlayers = parseInt(maxPlayers);

        if (isUnifiedWholeDay) {
            if (t.am) t.am = targetSlotData;
            if (t.pm) t.pm = targetSlotData;
        } else {
            t[slotKey] = targetSlotData;
        }

        saveData({ ...getData(), [dateStr]: event });
        return targetSlotData;
    }
};
