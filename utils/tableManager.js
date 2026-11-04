const fs = require('fs');
const path = require('path');
const { PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const { isValidDate } = require('./dateUtils');

const DATA_FILE = path.join(__dirname, '../data/reservations.json');

class TableManager {
    constructor() {
        this.MAX_TABLES = 15;
        this.reservations = this.loadReservations();
    }

    loadReservations() {
        try {
            if (fs.existsSync(DATA_FILE)) {
                const data = fs.readFileSync(DATA_FILE, 'utf8');
                let parsed = JSON.parse(data);
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                const cutoff = yesterday.toISOString().split('T')[0];

                const validParsed = parsed.filter(r => !r.date || r.date >= cutoff);
                
                // If pruning removed expired entries, persist immediately to disk (Bug #8 fix)
                if (validParsed.length !== parsed.length) {
                    this.reservations = validParsed;
                    this.saveReservations();
                }
                return validParsed;
            }
        } catch (error) {
            console.error('Error loading reservations:', error);
        }
        return [];
    }

    saveReservations() {
        try {
            const dataDir = path.dirname(DATA_FILE);
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }
            fs.writeFileSync(DATA_FILE, JSON.stringify(this.reservations, null, 2), 'utf8');
        } catch (error) {
            console.error('Error saving reservations:', error);
        }
    }

    addReservation(userId, username, playerNames, gameName, date = null, session = 'Evening 18:00-22:00') {
        const targetDate = date || new Date().toISOString().split('T')[0];
        const today = new Date().toISOString().split('T')[0];

        if (!isValidDate(targetDate)) {
            throw new Error("Invalid calendar date provided.");
        }
        if (targetDate < today) {
            throw new Error("You cannot book a table for a date in the past.");
        }

        const slotBookings = this.reservations.filter(r => (r.date || targetDate) === targetDate && (r.session || 'Evening 18:00-22:00') === session);
        const takenTables = slotBookings.map(r => r.tableNumber);

        let nextTableNumber = 1;
        while (takenTables.includes(nextTableNumber) && nextTableNumber <= this.MAX_TABLES) {
            nextTableNumber++;
        }

        if (nextTableNumber > this.MAX_TABLES) {
            throw new Error(`All tables are reserved for ${session} on ${targetDate}`);
        }

        const newReservation = {
            id: `res_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            userId,
            username,
            playerNames,
            gameName,
            tableNumber: nextTableNumber,
            date: targetDate,
            session,
            timestamp: new Date().toISOString()
        };

        this.reservations.push(newReservation);
        this.saveReservations();
        return nextTableNumber;
    }

    addReservationToSpecificTable(userId, username, playerNames, gameName, tableNumber, date = null, session = 'Evening 18:00-22:00') {
        if (tableNumber < 1 || tableNumber > this.MAX_TABLES) return -1;
        const targetDate = date || new Date().toISOString().split('T')[0];
        const today = new Date().toISOString().split('T')[0];

        if (!isValidDate(targetDate)) {
            throw new Error("Invalid calendar date provided.");
        }
        if (targetDate < today) {
            throw new Error("You cannot book a table for a date in the past.");
        }
        
        const exists = this.reservations.find(r => r.tableNumber === tableNumber && (r.date || targetDate) === targetDate && (r.session || 'Evening 18:00-22:00') === session);
        if (exists) return -1;

        const newReservation = {
            id: `res_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            userId,
            username,
            playerNames,
            gameName,
            tableNumber,
            date: targetDate,
            session,
            timestamp: new Date().toISOString()
        };

        this.reservations.push(newReservation);
        this.saveReservations();
        return tableNumber;
    }

    removeReservationById(reservationId) {
        const initialLength = this.reservations.length;
        this.reservations = this.reservations.filter(r => r.id !== reservationId);
        if (this.reservations.length !== initialLength) {
            this.saveReservations();
            return true;
        }
        return false;
    }

    removeReservationByTableAndDate(tableNumber, date, session = null) {
        const initialLength = this.reservations.length;
        this.reservations = this.reservations.filter(r => {
            const matchTable = r.tableNumber === tableNumber;
            const matchDate = r.date === date;
            const matchSession = session ? r.session === session : true;
            return !(matchTable && matchDate && matchSession);
        });
        if (this.reservations.length !== initialLength) {
            this.saveReservations();
            return true;
        }
        return false;
    }

    getUserReservations(userId) {
        return this.reservations.filter(r => r.userId === userId);
    }

    getAllReservations(date = null) {
        const list = date ? this.reservations.filter(r => r.date === date) : this.reservations;
        return [...list].sort((a, b) => {
            if (a.date !== b.date) return a.date.localeCompare(b.date);
            return a.tableNumber - b.tableNumber;
        });
    }

    getAvailableTableCount(date = null, session = 'Evening 18:00-22:00') {
        const targetDate = date || new Date().toISOString().split('T')[0];
        const taken = this.reservations.filter(r => (r.date || targetDate) === targetDate && (r.session || 'Evening 18:00-22:00') === session).length;
        return this.MAX_TABLES - taken;
    }

    resetAllReservations() {
        this.reservations = [];
        this.saveReservations();
    }

    async checkIfUserIsAdmin(userId, interaction = null) {
    try {

        // Slash command path
        if (interaction && interaction.member) {

            if (
                interaction.member.permissions.has(
                    PermissionFlagsBits.Administrator
                )
            ) {
                return true;
            }

            if (
                config.ADMIN_ROLE_ID &&
                interaction.member.roles.cache.has(
                    config.ADMIN_ROLE_ID
                )
            ) {
                return true;
            }
        }

        // DM command path
        const { client } = require('../index');

        for (const guild of client.guilds.cache.values()) {

            try {

                const member =
                    await guild.members.fetch(userId);

                if (
                    member.permissions.has(
                        PermissionFlagsBits.Administrator
                    )
                ) {
                    return true;
                }

                if (
                    config.ADMIN_ROLE_ID &&
                    member.roles.cache.has(
                        config.ADMIN_ROLE_ID
                    )
                ) {
                    return true;
                }

            } catch {
                continue;
            }
        }

        return false;

    } catch (error) {

        console.error(
            'Error checking admin status:',
            error
        );

        return false;
    }
}
}

module.exports = new TableManager();
