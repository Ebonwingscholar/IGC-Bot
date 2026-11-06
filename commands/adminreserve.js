const { SlashCommandBuilder } = require('discord.js');
const tableManager = require('../utils/tableManager');
const eventManager = require('../utils/eventManager');
const { isValidDate } = require('../utils/dateUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('adminreserve')
        .setDescription('Admin: Reserve a specific table for players (Thursday or Club Event)')
        .addIntegerOption(option => option.setName('table').setDescription('Table number (1-12)').setRequired(true).setMinValue(1).setMaxValue(12))
        .addUserOption(option => option.setName('player1').setDescription('First player / Host').setRequired(true))
        .addStringOption(option => option.setName('game').setDescription('Game name').setRequired(true))
        .addStringOption(option => option.setName('date').setDescription('Date (YYYY-MM-DD). Defaults to today / upcoming Thursday').setRequired(false))
        .addStringOption(option => option.setName('session').setDescription('Session slot: AM, PM, Whole Day (Events) or Evening (Thursdays)').setRequired(false))
        .addUserOption(option => option.setName('player2').setDescription('Second player').setRequired(false)),

    async execute(interaction) {
        const userId = interaction.user.id;
        const isAdmin = await tableManager.checkIfUserIsAdmin(userId, interaction);
        if (!isAdmin) {
            return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
        }

        const tableNumber = interaction.options.getInteger('table');
        const gameName = interaction.options.getString('game');
        const inputDate = interaction.options.getString('date');
        const sessionInput = interaction.options.getString('session');

        // Determine date logic
        const date = inputDate || new Date().toISOString().split('T')[0];

        if (!isValidDate(date)) {
            return interaction.reply({ content: '❌ Please provide a valid calendar date in YYYY-MM-DD format.', ephemeral: true });
        }

        const today = new Date().toISOString().split('T')[0];
        if (date < today) {
            return interaction.reply({ content: '❌ You cannot reserve a table for a date in the past.', ephemeral: true });
        }

        // Gather players
        const players = [];
        for (let i = 1; i <= 2; i++) {
            const user = interaction.options.getUser(`player${i}`);
            if (user) {
                try {
                    const member = await interaction.guild.members.fetch(user.id);
                    players.push(member);
                } catch {
                    players.push(user);
                }
            }
        }

        try {
            const result = await this.processAdminReservation(tableNumber, players, gameName, date, sessionInput);
            await interaction.reply({ content: result, ephemeral: true });
        } catch (error) {
            console.error('Error in adminreserve command:', error);
            await interaction.reply({ content: '❌ An error occurred while processing the reservation.', ephemeral: true });
        }
    },

    async handleDM(message, args) {
        const userId = message.author.id;
        const isAdmin = await tableManager.checkIfUserIsAdmin(userId);
        if (!isAdmin) {
            return message.reply('❌ You do not have permission to use this command.');
        }

        if (!args || args.trim() === '' || !args.includes('+')) {
            return message.reply('Usage: `!adminreserve <table_number> <player1, player2> + <game_name>`');
        }

        try {
            const parts = args.trim().split(/\s+/);
            const tableNumber = parseInt(parts[0]);
            const detailsText = parts.slice(1).join(' ');

            if (isNaN(tableNumber) || tableNumber < 1 || tableNumber > 12) {
                return message.reply('❌ Please provide a valid table number between 1 and 12.');
            }

            const detailParts = detailsText.split('+');
            const playerNames = detailParts[0].trim();
            const gameName = detailParts[1].trim();
            const date = new Date().toISOString().split('T')[0];
            const session = 'Evening 18:00-22:00';

            const result = await this.processAdminReservationDM(tableNumber, playerNames, gameName, date, session);
            await message.reply(result);
        } catch (error) {
            console.error('Error in adminreserve DM:', error);
            await message.reply('❌ An error occurred while processing the reservation.');
        }
    },

    async processAdminReservation(tableNumber, players, gameName, date, sessionInput) {
        if (!players || players.length === 0) return '❌ Please provide at least one player.';
        if (!gameName || gameName.trim() === '') return '❌ Please provide a game name.';

        const primaryPlayer = players[0];
        const primaryId = primaryPlayer.id || primaryPlayer.user?.id;
        const primaryName = primaryPlayer.displayName || primaryPlayer.user?.username || primaryPlayer.username;
        const allPlayerNames = players.map(p => p.displayName || p.user?.username || p.username).join(', ');

        // Check if date corresponds to a scheduled manual Event
        const eventData = eventManager.getEventData(date);
        const isEventDate = eventData && eventData.eventName;

        if (isEventDate) {
            const slot = sessionInput ? sessionInput.trim() : 'Whole Day';
            const eventSlotData = {
                organizerId: primaryId,
                organizerName: primaryName,
                gameName: gameName.trim(),
                maxPlayers: 8,
                players: players.map(p => ({
                    id: p.id || p.user?.id,
                    name: p.displayName || p.user?.username || p.username
                }))
            };

            if (slot === 'Whole Day' || slot === 'Both') {
                eventData.tables[tableNumber].am = eventSlotData;
                eventData.tables[tableNumber].pm = eventSlotData;
            } else if (slot.toUpperCase() === 'AM' || slot.toLowerCase().includes('morning')) {
                eventData.tables[tableNumber].am = eventSlotData;
            } else {
                eventData.tables[tableNumber].pm = eventSlotData;
            }

            const fs = require('fs');
            const path = require('path');
            const filePath = path.join(__dirname, '../data/event-bookings.json');
            const fullData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            fullData[date] = eventData;
            fs.writeFileSync(filePath, JSON.stringify(fullData, null, 2));

            return `✅ **Admin Override:** Reserved Table ${tableNumber} for **${allPlayerNames}** playing **${gameName}** on Event Date **${date}** (${slot}).`;
        } else {
            // Standard Thursday night system
            const session = sessionInput || 'Evening 18:00-22:00';
            const assignedTableNumber = tableManager.addReservationToSpecificTable(
                primaryId,
                primaryName,
                allPlayerNames,
                gameName.trim(),
                tableNumber,
                date,
                session
            );

            if (assignedTableNumber === -1) return `❌ Failed to reserve Table ${tableNumber} for ${date} (${session}).`;
            return `✅ **Admin Override:** Reserved Table ${tableNumber} for **${allPlayerNames}** playing **${gameName}** on **${date}** (${session}).`;
        }
    },

    async processAdminReservationDM(tableNumber, playerNames, gameName, date, session) {
        if (!playerNames || !gameName) return '❌ Invalid parameters format.';

        const assignedTableNumber = tableManager.addReservationToSpecificTable(
            'admin_' + Date.now(),
            'Admin Booking',
            playerNames,
            gameName,
            tableNumber,
            date,
            session
        );

        if (assignedTableNumber === -1) return `❌ Failed to reserve Table ${tableNumber} for ${date} (${session}).`;
        return `✅ **Admin Override:** Reserved Table ${tableNumber} for **${playerNames}** playing **${gameName}** on **${date}** (${session}).`;
    }
};
