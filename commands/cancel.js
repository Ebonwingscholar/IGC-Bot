const { SlashCommandBuilder } = require('discord.js');
const tableManager = require('../utils/tableManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('cancel')
        .setDescription('Cancel your table reservation')
        .addStringOption(option => 
            option.setName('date')
                .setDescription('Date of the reservation to cancel (YYYY-MM-DD)')
                .setRequired(false))
        .addStringOption(option => 
            option.setName('session')
                .setDescription('Session slot of the reservation to cancel')
                .setRequired(false)),
    
    async execute(interaction) {
        const userId = interaction.user.id;
        const date = interaction.options.getString('date');
        const session = interaction.options.getString('session');
        try {
            const result = await this.processCancel(userId, date, session);
            await interaction.reply({ content: result, ephemeral: true });
        } catch (error) {
            console.error('Error in cancel command:', error);
            await interaction.reply({ content: 'An error occurred while canceling your reservation.', ephemeral: true });
        }
    },
    
    async handleDM(message, args) {
        const userId = message.author.id;
        const date = args ? args.trim() : null;
        try {
            const result = await this.processCancel(userId, date, null);
            await message.reply(result);
        } catch (error) {
            console.error('Error in cancel DM command:', error);
            await message.reply('An error occurred while canceling your reservation.');
        }
    },
    
    async processCancel(userId, date, session) {
        const allUserRes = tableManager.getUserReservations(userId);

        if (allUserRes.length === 0) {
            return 'You don\'t have any active general reservations to cancel.';
        }

        // If date & session are specified, filter precisely
        let targets = allUserRes;
        if (date) {
            targets = targets.filter(r => r.date === date);
        }
        if (session) {
            targets = targets.filter(r => (r.session || 'Evening 18:00-22:00').toLowerCase() === session.toLowerCase());
        }

        if (targets.length === 0) {
            return `You don't have an active reservation matching date: ${date || 'any'} and session: ${session || 'any'}.`;
        }

        if (targets.length > 1) {
            const listStr = targets.map(r => `• Table ${r.tableNumber} on ${r.date} (${r.session || 'Evening'})`).join('\n');
            return `You have multiple matching reservations:\n${listStr}\n\nPlease specify both the \`date\` and \`session\` to cancel a specific booking.`;
        }

        const reservation = targets[0];
        tableManager.removeReservationById(reservation.id);
        return `Your reservation for Table ${reservation.tableNumber} on ${reservation.date} (${reservation.session || 'Evening'}) has been canceled.`;
    }
};
