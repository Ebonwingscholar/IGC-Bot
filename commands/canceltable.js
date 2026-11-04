const { SlashCommandBuilder } = require('discord.js');
const tableManager = require('../utils/tableManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('canceltable')
        .setDescription('Cancel a reservation by table number and date (Admin only)')
        .addIntegerOption(option => option.setName('table').setDescription('Table number').setRequired(true))
        .addStringOption(option => option.setName('date').setDescription('Date (YYYY-MM-DD), defaults to today').setRequired(false))
        .addStringOption(option => option.setName('session').setDescription('Session slot').setRequired(false)),
    
    async execute(interaction) {
        const isAdmin = await tableManager.checkIfUserIsAdmin(interaction.user.id, interaction);
        if (!isAdmin) {
            await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
            return;
        }

        const tableNumber = interaction.options.getInteger('table');
        const date = interaction.options.getString('date') || new Date().toISOString().split('T')[0];
        const session = interaction.options.getString('session');

        try {
            const result = await this.processCancelTable(tableNumber, date, session);
            await interaction.reply(result);
        } catch (error) {
            console.error('Error in canceltable command:', error);
            await interaction.reply({ content: 'An error occurred while canceling the reservation.', ephemeral: true });
        }
    },
    
    async handleDM(message, args) {
        const userId = message.author.id;
        if (!args || args.length === 0 || isNaN(parseInt(args.split(/\s+/)[0]))) {
            await message.reply('Please provide a valid table number to cancel. Format: `!canceltable <table_number> [YYYY-MM-DD]`');
            return;
        }
        
        const parts = args.trim().split(/\s+/);
        const tableNumber = parseInt(parts[0]);
        const date = parts[1] || new Date().toISOString().split('T')[0];

        try {
            const isAdmin = await tableManager.checkIfUserIsAdmin(userId);
            if (!isAdmin) {
                await message.reply('You do not have permission to use this command.');
                return;
            }
            const result = await this.processCancelTable(tableNumber, date, null);
            await message.reply(result);
        } catch (error) {
            console.error('Error in canceltable DM command:', error);
            await message.reply('An error occurred while canceling the reservation.');
        }
    },
    
    async processCancelTable(tableNumber, date, session) {
        const reservations = tableManager.getAllReservations(date);
        const candidates = reservations.filter(r => {
            const matchTable = r.tableNumber === tableNumber;
            const matchSession = session ? (r.session || '').toLowerCase() === session.toLowerCase() : true;
            return matchTable && matchSession;
        });

        if (candidates.length === 0) {
            return `There is no reservation for Table ${tableNumber} on ${date}${session ? ` for session ${session}` : ''}.`;
        }

        if (candidates.length > 1) {
            return `Multiple reservations found for Table ${tableNumber} on ${date}. Please specify the session slot.`;
        }

        const reservation = candidates[0];
        tableManager.removeReservationById(reservation.id);
        return `Reservation for Table ${tableNumber} (${reservation.playerNames}) on ${reservation.date} (${reservation.session || 'Evening'}) has been canceled.`;
    }
};
