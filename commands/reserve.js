const { SlashCommandBuilder } = require('discord.js');
const tableManager = require('../utils/tableManager');

module.exports = {
    data: new SlashCommandBuilder()
    .setName('reserve')
    .setDescription('Reserve a table for your game')
    .addUserOption(option =>
        option.setName('player1')
            .setDescription('First player (yourself or someone else)')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('game')
            .setDescription('Name of the game you will be playing')
            .setRequired(true))
    .addUserOption(option =>
        option.setName('player2')
            .setDescription('Second player')
            .setRequired(false))
    .addUserOption(option =>
        option.setName('player3')
            .setDescription('Third player')
            .setRequired(false))
    .addUserOption(option =>
        option.setName('player4')
            .setDescription('Fourth player')
            .setRequired(false))
    .addUserOption(option =>
        option.setName('player5')
            .setDescription('Fifth player')
            .setRequired(false))
    .addUserOption(option =>
        option.setName('player6')
            .setDescription('Sixth player')
            .setRequired(false))
        .addStringOption(option =>
            option.setName('game')
                .setDescription('Name of the game you will be playing')
                .setRequired(true)),
    
    async execute(interaction) {
        const userId = interaction.user.id;
        const username = interaction.user.tag;
        
        // Collect all mentioned players
        const players = [];
        for (let i = 1; i <= 6; i++) {
            const player = interaction.options.getUser(`player${i}`);
            if (player) {
                players.push(player);
            }
        }
        
        const gameName = interaction.options.getString('game');
        
        try {
            const result = await this.processReservationWithUsers(userId, username, players, gameName);
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
    
    async processReservationWithUsers(userId, username, players, gameName) {
        // Validate the input
        if (!players || players.length === 0) {
            return 'Please provide at least one player.';
        }
        
        if (!gameName || gameName.trim() === '') {
            return 'Please provide a game name.';
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
        
        // Build player names string from Discord users
        const playerNames = players.map(player => player.displayName || player.username).join(', ');
        
        // Create the reservation
        const tableNumber = tableManager.addReservation(userId, username, playerNames, gameName.trim());
        
        // Send payment reminder to the user
        this.sendPaymentReminder(userId, tableNumber, playerNames, gameName.trim());
        
        return `Table ${tableNumber} has been reserved for ${playerNames} playing ${gameName}. Have a great game!`;
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

You can pay via PayPal: https://www.paypal.me/Granitegamingco?locale.x=en_GB
Please use the "Friends and Family" option when making your payment.

Full instructions on club fees and payment methods are available in the club fees and how to pay channel.

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
