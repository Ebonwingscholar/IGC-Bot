const { SlashCommandBuilder } = require('discord.js');
const tableManager = require('../utils/tableManager');
const config = require('../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('reset')
        .setDescription('Reset all table reservations (Admin only)'),
    
    async execute(interaction) {
        // Check if the user has the admin role
        const member = interaction.member;
        if (!member.roles.cache.some(role => role.id === config.ADMIN_ROLE_ID)) {
            await interaction.reply({ content: 'You do not have permission to use this command. Only club admins can reset reservations.', ephemeral: true });
            return;
        }
        
        try {
            tableManager.resetAllReservations();
            await interaction.reply('All table reservations have been reset. The tables are now available for the next session.');
        } catch (error) {
            console.error('Error in reset command:', error);
            await interaction.reply({ content: 'An error occurred while resetting reservations. Please try again.', ephemeral: true });
        }
    },
    
    async handleDM(message) {
        const userId = message.author.id;
        
        try {
            // Check if the user is in any guilds where the bot is present
            const isAdmin = await this.checkIfUserIsAdmin(userId);
            
            if (!isAdmin) {
                await message.reply('You do not have permission to use this command. Only club admins can reset reservations.');
                return;
            }
            
            tableManager.resetAllReservations();
            await message.reply('All table reservations have been reset. The tables are now available for the next session.');
        } catch (error) {
            console.error('Error in reset DM command:', error);
            await message.reply('An error occurred while resetting reservations. Please try again.');
        }
    },
    
    async checkIfUserIsAdmin(userId) {
        const { client } = require('../index');
        
        // Check all guilds the bot is in
        for (const guild of client.guilds.cache.values()) {
            try {
                // Fetch the member from the guild
                const member = await guild.members.fetch(userId);
                if (member && member.roles.cache.some(role => role.id === config.ADMIN_ROLE_ID)) {
                    return true;
                }
            } catch (error) {
                // User might not be in this guild, continue checking others
                continue;
            }
        }
        
        return false;
    }
};
