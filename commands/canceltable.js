const { SlashCommandBuilder } = require('discord.js');
const tableManager = require('../utils/tableManager');
const config = require('../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('canceltable')
        .setDescription('Cancel a reservation by table number (Admin only)')
        .addIntegerOption(option => 
            option.setName('table')
                .setDescription('The table number to cancel')
                .setRequired(true)),
    
    async execute(interaction) {
        // Check if the user has the admin role
        const member = interaction.member;
        if (!member.roles.cache.some(role => role.id === config.ADMIN_ROLE_ID)) {
            await interaction.reply({ content: 'You do not have permission to use this command. Only club admins can cancel other reservations.', ephemeral: true });
            return;
        }

        const tableNumber = interaction.options.getInteger('table');
        
        try {
            const result = await this.processCancelTable(tableNumber);
            await interaction.reply(result);
        } catch (error) {
            console.error('Error in canceltable command:', error);
            await interaction.reply({ content: 'An error occurred while canceling the reservation. Please try again.', ephemeral: true });
        }
    },
    
    async handleDM(message, args) {
        const userId = message.author.id;
        
        if (!args || args.length === 0 || isNaN(parseInt(args[0]))) {
            await message.reply('Please provide a valid table number to cancel.');
            return;
        }
        
        const tableNumber = parseInt(args[0]);
        
        try {
            // Check if the user is an admin
            const isAdmin = await this.checkIfUserIsAdmin(userId);
            
            if (!isAdmin) {
                await message.reply('You do not have permission to use this command. Only club admins can cancel other reservations.');
                return;
            }
            
            const result = await this.processCancelTable(tableNumber);
            await message.reply(result);
        } catch (error) {
            console.error('Error in canceltable DM command:', error);
            await message.reply('An error occurred while canceling the reservation. Please try again.');
        }
    },
    
    async processCancelTable(tableNumber) {
        // Check if the table exists and has a reservation
        const reservations = tableManager.getAllReservations();
        const reservation = reservations.find(r => r.tableNumber === tableNumber);
        
        if (!reservation) {
            return `There is no reservation for Table ${tableNumber}.`;
        }
        
        // Cancel the reservation
        const userId = reservation.userId;
        const playerNames = reservation.playerNames;
        tableManager.removeReservation(userId);
        
        return `Reservation for Table ${tableNumber} (${playerNames}) has been canceled.`;
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