const fs = require('fs');
const path = require('path');

// Path to the data file
const DATA_FILE = path.join(__dirname, '../data/reservations.json');

class TableManager {
    constructor() {
        this.MAX_TABLES = 15; // Maximum number of tables available
        this.reservations = this.loadReservations();
    }

    /**
     * Load reservations from the data file
     */
    loadReservations() {
        try {
            if (fs.existsSync(DATA_FILE)) {
                const data = fs.readFileSync(DATA_FILE, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            console.error('Error loading reservations:', error);
        }
        return [];
    }

    /**
     * Save reservations to the data file
     */
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

    /**
     * Add a new reservation
     */
    addReservation(userId, username, playerNames, gameName) {
        // Find the next available table number
        const tableNumbers = this.reservations.map(r => r.tableNumber);
        let nextTableNumber = 1;
        
        while (tableNumbers.includes(nextTableNumber) && nextTableNumber <= this.MAX_TABLES) {
            nextTableNumber++;
        }
        
        if (nextTableNumber > this.MAX_TABLES) {
            throw new Error('All tables are reserved');
        }
        
        // Create the new reservation
        const newReservation = {
            userId,
            username,
            playerNames,
            gameName,
            tableNumber: nextTableNumber,
            timestamp: new Date().toISOString()
        };
        
        this.reservations.push(newReservation);
        this.saveReservations();
        
        return nextTableNumber;
    }

    /**
     * Remove a reservation by user ID
     */
    removeReservation(userId) {
        const initialLength = this.reservations.length;
        this.reservations = this.reservations.filter(r => r.userId !== userId);
        
        if (this.reservations.length !== initialLength) {
            this.saveReservations();
            return true;
        }
        
        return false;
    }

    /**
     * Get a user's reservation
     */
    getUserReservation(userId) {
        return this.reservations.find(r => r.userId === userId);
    }

    /**
     * Get all reservations, sorted by table number
     */
    getAllReservations() {
        return [...this.reservations].sort((a, b) => a.tableNumber - b.tableNumber);
    }

    /**
     * Get the number of available tables
     */
    getAvailableTableCount() {
        return this.MAX_TABLES - this.reservations.length;
    }

    /**
     * Reset all reservations
     */
    resetAllReservations() {
        this.reservations = [];
        this.saveReservations();
    }
}

// Export a singleton instance
module.exports = new TableManager();
