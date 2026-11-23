const { SlashCommandBuilder } = require('discord.js');
const tableManager = require('../utils/tableManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('reset')
        .setDescription('Reset all general table reservations (Admin only)'),
    
    async execute(interaction) {
        const isAdmin = await tableManager.checkIfUserIsAdmin(interaction.user.id, interaction);
        if (!isAdmin) {
            await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
            return;
        }
        
        try {
            tableManager.resetAllReservations();
            await interaction.reply('All table reservations have been reset.');
        } catch (error) {
            console.error('Error in reset command:', error);
            await interaction.reply({ content: 'An error occurred while resetting reservations.', ephemeral: true });
        }
    },
    
    async handleDM(message) {
        const userId = message.author.id;
        try {
            const isAdmin = await tableManager.checkIfUserIsAdmin(userId);
            if (!isAdmin) {
                await message.reply('You do not have permission to use this command.');
                return;
            }
            tableManager.resetAllReservations();
            await message.reply('All table reservations have been reset.');
        } catch (error) {
            console.error('Error in reset DM command:', error);
            await message.reply('An error occurred while resetting reservations.');
        }
    }
};
