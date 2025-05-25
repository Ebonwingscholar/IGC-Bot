const { SlashCommandBuilder } = require('discord.js');
const tableManager = require('../utils/tableManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('reserve')
        .setDescription('Reserve a table for your game')
        .addStringOption(option => 
            option.setName('details')
                .setDescription('Provide player names and game name (format: "Player1, Player2 + Game Name")')
                .setRequired(true)),
    
    async execute(interaction) {
        const details = interaction.options.getString('details');
        const userId = interaction.user.id;
        const username = interaction.user.tag;
        
        try {
            const result = await this.processReservation(userId, username, details);
            await interaction.reply(result);
        } catch (error) {
            console.error('Error in reserve command:', error);
            await interaction.reply({ content: 'An error occurred while processing your reservation. Please try again.', ephemeral: true });
        }
    },
    
    async handleDM(message, detailsText) {
        const userId = message.author.id;
        const username = message.author.tag;
        
        if (!detailsText || detailsText.trim() === '') {
            await message.reply('Please provide player names and game name (format: "Player1, Player2 + Game Name")');
            return;
        }
        
        try {
            const result = await this.processReservation(userId, username, detailsText);
            await message.reply(result);
        } catch (error) {
            console.error('Error in reserve DM command:', error);
            await message.reply('An error occurred while processing your reservation. Please try again.');
        }
    },
    
    async processReservation(userId, username, details) {
        // Parse details - expected format: "Player1, Player2 + Game Name"
        let playerNames, gameName;
        
        if (details.includes('+')) {
            const parts = details.split('+');
            playerNames = parts[0].trim();
            gameName = parts[1].trim();
        } else if (details.includes('|')) {
            // For backward compatibility
            const parts = details.split('|');
            playerNames = parts[0].trim();
            gameName = parts[1].trim();
        } else {
            // If no game name provided, use players as players and set default game
            playerNames = details.trim();
            gameName = 'Unspecified Game';
        }
        
        // Validate the input
        if (!playerNames) {
            return 'Please provide at least one player name.';
        }
        
        // Check if the user already has a reservation
        const existingReservation = tableManager.getUserReservation(userId);
        if (existingReservation) {
            return `You already have a reservation at Table ${existingReservation.tableNumber}. Please cancel it first if you want to make a new reservation.`;
        }
        
        // Check if tables are available
        if (tableManager.getAvailableTableCount() === 0) {
            return 'Sorry, all tables are currently reserved. Please try again later.';
        }
        
        // Create the reservation
        const tableNumber = tableManager.addReservation(userId, username, playerNames, gameName);
        
        // Send payment reminder to the user
        this.sendPaymentReminder(userId, tableNumber, playerNames, gameName);
        
        return `Table ${tableNumber} has been reserved for ${playerNames} playing ${gameName}. Have a great game!`;
    },
    
    async sendPaymentReminder(userId, tableNumber, playerNames, gameName) {
        try {
            const { client } = require('../index');
            const user = await client.users.fetch(userId);
            
            if (user) {
                const reminderMessage = `
**Payment Reminder for Table ${tableNumber}**

Thank you for reserving Table ${tableNumber} for ${playerNames} playing ${gameName}.

Please remember to pay for your table before playing. This helps us maintain the club and provide the best gaming experience for everyone.

You can pay at the club entrance when you arrive. If you have any questions, please speak to a club admin.

Have a great game!
                `;
                
                await user.send(reminderMessage);
            }
        } catch (error) {
            console.error('Error sending payment reminder:', error);
            // Don't throw the error - this is a notification and shouldn't block the main reservation process
        }
    }
};
