const { SlashCommandBuilder } = require('discord.js');
const tableManager = require('../utils/tableManager');
require('dotenv').config(); // Load env vars

module.exports = {
    data: new SlashCommandBuilder()
        .setName('reserve')
        .setDescription('Reserve a table for your game')
        .addUserOption(option =>
            option.setName('player1').setDescription('First player (yourself or someone else)').setRequired(true))
        .addStringOption(option =>
            option.setName('game').setDescription('Name of the game you will be playing').setRequired(true))
        .addUserOption(option =>
            option.setName('player2').setDescription('Second player').setRequired(false))
        .addUserOption(option =>
            option.setName('player3').setDescription('Third player').setRequired(false))
        .addUserOption(option =>
            option.setName('player4').setDescription('Fourth player').setRequired(false))
        .addUserOption(option =>
            option.setName('player5').setDescription('Fifth player').setRequired(false))
        .addUserOption(option =>
            option.setName('player6').setDescription('Sixth player').setRequired(false)),

    async execute(interaction) {
        const userId = interaction.user.id;
        const username = interaction.user.tag;

        const players = [];
        for (let i = 1; i <= 6; i++) {
            const user = interaction.options.getUser(`player${i}`);
            if (user) {
                players.push(user);
            }
        }

        const gameName = interaction.options.getString('game');

        try {
            const result = await this.processReservationWithUsers(userId, username, players, gameName, interaction.guild);
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

    async processReservationWithUsers(userId, username, users, gameName, guild) {
        if (!users || users.length === 0) return 'Please provide at least one player.';
        if (!gameName || gameName.trim() === '') return 'Please provide a game name.';

        const existingReservation = tableManager.getUserReservation(userId);
        if (existingReservation) {
            return `You already have a reservation at Table ${existingReservation.tableNumber}. Please cancel it first if you want to make a new reservation.`;
        }

        if (tableManager.getAvailableTableCount() === 0) {
            return 'Sorry, all tables are currently reserved. Please try again later.';
        }

        const playerNamesArray = await Promise.all(users.map(async user => {
            try {
                const member = await guild.members.fetch(user.id);
                return member.displayName || user.username;
            } catch {
                return user.username;
            }
        }));

        const playerNames = playerNamesArray.join(', ');
        const tableNumber = tableManager.addReservation(userId, username, playerNames, gameName.trim());

        await this.sendPaymentReminder(users, tableNumber, playerNames, gameName.trim());

        return `Table ${tableNumber} has been reserved for ${playerNames} playing ${gameName}. Have a great game!`;
    },

    async processReservation(userId, username, details) {
        let playerNames, gameName;

        if (details.includes('+')) {
            const parts = details.split('+');
            playerNames = parts[0].trim();
            gameName = parts[1].trim();
        } else if (details.includes('|')) {
            const parts = details.split('|');
            playerNames = parts[0].trim();
            gameName = parts[1].trim();
        } else {
            playerNames = details.trim();
            gameName = 'Unspecified Game';
        }

        if (!playerNames) return 'Please provide at least one player name.';

        const existingReservation = tableManager.getUserReservation(userId);
        if (existingReservation) {
            return `You already have a reservation at Table ${existingReservation.tableNumber}. Please cancel it first if you want to make a new reservation.`;
        }

        if (tableManager.getAvailableTableCount() === 0) {
            return 'Sorry, all tables are currently reserved. Please try again later.';
        }

        const tableNumber = tableManager.addReservation(userId, username, playerNames, gameName);

        await this.sendPaymentReminder([{ id: userId }], tableNumber, playerNames, gameName);

        return `Table ${tableNumber} has been reserved for ${playerNames} playing ${gameName}. Have a great game!`;
    },

    async sendPaymentReminder(users, tableNumber, playerNames, gameName) {
        try {
            const { client } = require('../index');

            const reminderMessage = `
**Payment Reminder for Table ${tableNumber}**

Thank you for reserving Table ${tableNumber} for ${playerNames} playing ${gameName}.

Please pay your table fee **before playing**. This helps support the club.

💳 **Bank Transfer Details**
• **Account Name:** ${process.env.BANK_ACCOUNT_NAME}
• **Sort Code:** ${process.env.BANK_SORT_CODE}
• **Account Number:** ${process.env.BANK_ACCOUNT_NUMBER}

Please add your name and date of the session to the payment reference. For example: "D Smith 12/10/25"

Have a great game!
            `;

            for (const user of users) {
                try {
                    const fetchedUser = await client.users.fetch(user.id);
                    if (fetchedUser) {
                        await fetchedUser.send(reminderMessage);
                    }
                } catch (err) {
                    console.error(`Could not send DM to user ${user.id}:`, err.message);
                }
            }
        } catch (error) {
            console.error('Error sending payment reminders:', error);
        }
    }
};