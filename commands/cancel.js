const { SlashCommandBuilder } = require('discord.js');
const tableManager = require('../utils/tableManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('cancel')
        .setDescription('Cancel your table reservation'),
    
    async execute(interaction) {
        const userId = interaction.user.id;
        
        try {
            const result = await this.processCancel(userId);
            await interaction.reply(result);
        } catch (error) {
            console.error('Error in cancel command:', error);
            await interaction.reply({ content: 'An error occurred while canceling your reservation. Please try again.', ephemeral: true });
        }
    },
    
    async handleDM(message) {
        const userId = message.author.id;
        
        try {
            const result = await this.processCancel(userId);
            await message.reply(result);
        } catch (error) {
            console.error('Error in cancel DM command:', error);
            await message.reply('An error occurred while canceling your reservation. Please try again.');
        }
    },
    
    async processCancel(userId) {
        // Check if the user has a reservation
        const reservation = tableManager.getUserReservation(userId);
        
        if (!reservation) {
            return 'You don\'t have any active reservations to cancel.';
        }
        
        // Cancel the reservation
        const tableNumber = reservation.tableNumber;
        tableManager.removeReservation(userId);
        
        return `Your reservation for Table ${tableNumber} has been canceled. Thank you!`;
    }
};
