const { SlashCommandBuilder } = require('discord.js');
const tableManager = require('../utils/tableManager');
const eventManager = require('../utils/eventManager');
const fs = require('fs');
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('canceltable')
        .setDescription('Cancel a reservation by table number and date (Admin only)')
        .addIntegerOption(option => option.setName('table').setDescription('Table number (1-12)').setRequired(true).setMinValue(1).setMaxValue(12))
        .addStringOption(option => option.setName('date').setDescription('Date (YYYY-MM-DD), defaults to today').setRequired(false))
        .addStringOption(option => option.setName('session').setDescription('Session slot: AM, PM, Whole Day (Events) or Evening (Thursdays)').setRequired(false)),

    async execute(interaction) {
        const isAdmin = await tableManager.checkIfUserIsAdmin(interaction.user.id, interaction);
        if (!isAdmin) {
            return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
        }

        const tableNumber = interaction.options.getInteger('table');
        const date = interaction.options.getString('date') || new Date().toISOString().split('T')[0];
        const session = interaction.options.getString('session');

        try {
            const result = await this.processCancelTable(tableNumber, date, session);
            await interaction.reply({ content: result, ephemeral: true });
        } catch (error) {
            console.error('Error in canceltable command:', error);
            await interaction.reply({ content: '❌ An error occurred while canceling the reservation.', ephemeral: true });
        }
    },

    async handleDM(message, args) {
        const userId = message.author.id;
        if (!args || args.length === 0 || isNaN(parseInt(args.split(/\s+/)[0]))) {
            return message.reply('Usage: `!canceltable <table_number> [YYYY-MM-DD]`');
        }

        const parts = args.trim().split(/\s+/);
        const tableNumber = parseInt(parts[0]);
        const date = parts[1] || new Date().toISOString().split('T')[0];

        try {
            const isAdmin = await tableManager.checkIfUserIsAdmin(userId);
            if (!isAdmin) {
                return message.reply('❌ You do not have permission to use this command.');
            }
            const result = await this.processCancelTable(tableNumber, date, null);
            await message.reply(result);
        } catch (error) {
            console.error('Error in canceltable DM command:', error);
            await message.reply('❌ An error occurred while canceling the reservation.');
        }
    },

    async processCancelTable(tableNumber, date, session) {
        // Check if date corresponds to a scheduled Event
        const eventData = eventManager.getEventData(date);
        const isEventDate = eventData && eventData.eventName;

        if (isEventDate) {
            const table = eventData.tables[tableNumber];

            if (!table || (!table.am && !table.pm)) {
                return `❌ Table ${tableNumber} has no active event bookings on ${date}.`;
            }

            const targetSlot = session ? session.toLowerCase() : null;
            let cancelledText = '';

            if (targetSlot === 'am' || targetSlot === 'morning') {
                if (!table.am) return `❌ Table ${tableNumber} has no AM booking on ${date}.`;
                cancelledText = `AM slot ("${table.am.gameName}")`;
                table.am = null;
            } else if (targetSlot === 'pm' || targetSlot === 'afternoon') {
                if (!table.pm) return `❌ Table ${tableNumber} has no PM booking on ${date}.`;
                cancelledText = `PM slot ("${table.pm.gameName}")`;
                table.pm = null;
            } else {
                // Whole Day / No session specified -> Clear all active slots on table
                const games = [];
                if (table.am) games.push(`AM: ${table.am.gameName}`);
                if (table.pm) games.push(`PM: ${table.pm.gameName}`);
                cancelledText = games.join(' & ');

                table.am = null;
                table.pm = null;
            }

            // Save updated JSON state
            const filePath = path.join(__dirname, '../data/event-bookings.json');
            const fullData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            fullData[date] = eventData;
            fs.writeFileSync(filePath, JSON.stringify(fullData, null, 2));

            return `✅ **Admin Override:** Cleared Table ${tableNumber} (${cancelledText}) on Event Date **${date}**.`;
        } else {
            // Thursday / Regular system
            const reservations = tableManager.getAllReservations(date);
            const candidates = reservations.filter(r => {
                const matchTable = r.tableNumber === tableNumber;
                const matchSession = session ? (r.session || '').toLowerCase() === session.toLowerCase() : true;
                return matchTable && matchSession;
            });

            if (candidates.length === 0) {
                return `❌ There is no reservation for Table ${tableNumber} on ${date}${session ? ` for session ${session}` : ''}.`;
            }

            if (candidates.length > 1) {
                return `⚠️ Multiple reservations found for Table ${tableNumber} on ${date}. Please specify the session slot.`;
            }

            const reservation = candidates[0];
            tableManager.removeReservationById(reservation.id);
            return `✅ **Admin Override:** Reservation for Table ${tableNumber} (${reservation.playerNames}) on **${reservation.date}** (${reservation.session || 'Evening'}) has been canceled.`;
        }
    }
};
