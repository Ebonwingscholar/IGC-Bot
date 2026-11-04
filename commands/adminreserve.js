const { SlashCommandBuilder } = require('discord.js');
const tableManager = require('../utils/tableManager');
const { isValidDate } = require('../utils/dateUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('adminreserve')
        .setDescription('Admin: Reserve a specific table for players')
        .addIntegerOption(option => option.setName('table').setDescription('Table number').setRequired(true).setMinValue(1))
        .addUserOption(option => option.setName('player1').setDescription('First player').setRequired(true))
        .addStringOption(option => option.setName('game').setDescription('Game name').setRequired(true))
        .addStringOption(option => option.setName('date').setDescription('Date (YYYY-MM-DD)').setRequired(false))
        .addStringOption(option => option.setName('session').setDescription('Session slot').setRequired(false))
        .addUserOption(option => option.setName('player2').setDescription('Second player').setRequired(false)),
  
    async execute(interaction) {
        const userId = interaction.user.id;
        const isAdmin = await tableManager.checkIfUserIsAdmin(userId, interaction);
        if (!isAdmin) {
            await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
            return;
        }
        
        const tableNumber = interaction.options.getInteger('table');
        const gameName = interaction.options.getString('game');
        const date = interaction.options.getString('date') || new Date().toISOString().split('T')[0];
        const session = interaction.options.getString('session') || 'Evening 18:00-22:00';

        if (!isValidDate(date)) {
            await interaction.reply({ content: '❌ Please provide a valid calendar date in YYYY-MM-DD format.', ephemeral: true });
            return;
        }

        const today = new Date().toISOString().split('T')[0];
        if (date < today) {
            await interaction.reply({ content: '❌ You cannot reserve a table for a date in the past.', ephemeral: true });
            return;
        }

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
            const result = await this.processAdminReservation(tableNumber, players, gameName, date, session);
            await interaction.reply(result);
        } catch (error) {
            console.error('Error in adminreserve command:', error);
            await interaction.reply({ content: 'An error occurred while processing the reservation.', ephemeral: true });
        }
    },
    
    async handleDM(message, args) {
        const userId = message.author.id;
        const isAdmin = await tableManager.checkIfUserIsAdmin(userId);
        if (!isAdmin) {
            await message.reply('You do not have permission to use this command.');
            return;
        }
        
        if (!args || args.trim() === '' || !args.includes('+')) {
            await message.reply('Usage: !adminreserve <table_number> <player1, player2> + <game_name>');
            return;
        }
        
        try {
            const parts = args.trim().split(/\s+/);
            const tableNumber = parseInt(parts[0]);
            const detailsText = parts.slice(1).join(' ');
            
            if (isNaN(tableNumber)) {
                await message.reply('Please provide a valid table number.');
                return;
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
            await message.reply('An error occurred while processing the reservation.');
        }
    },
    
    async processAdminReservation(tableNumber, players, gameName, date, session) {
        if (!players || players.length === 0) return 'Please provide at least one player.';
        if (!gameName || gameName.trim() === '') return 'Please provide a game name.';
        
        const playerNames = players.map(p => p.displayName || p.user?.username || p.username).join(', ');
        const primaryPlayer = players[0];
        const assignedTableNumber = tableManager.addReservationToSpecificTable(
            primaryPlayer.id || primaryPlayer.user?.id, 
            primaryPlayer.displayName || primaryPlayer.user?.username || primaryPlayer.username, 
            playerNames, 
            gameName.trim(), 
            tableNumber,
            date,
            session
        );
        
        if (assignedTableNumber === -1) return `Failed to reserve Table ${tableNumber} for ${date} (${session}).`;
        return `Table ${tableNumber} has been reserved for ${playerNames} playing ${gameName} on ${date} (${session}).`;
    },
    
    async processAdminReservationDM(tableNumber, playerNames, gameName, date, session) {
        if (!playerNames || !gameName) return 'Invalid parameters format.';
        const assignedTableNumber = tableManager.addReservationToSpecificTable(
            'admin_' + Date.now(), 
            'Admin Booking', 
            playerNames, 
            gameName, 
            tableNumber,
            date,
            session
        );
        if (assignedTableNumber === -1) return `Failed to reserve Table ${tableNumber} for ${date} (${session}).`;
        return `Table ${tableNumber} has been reserved for ${playerNames} playing ${gameName} on ${date} (${session}).`;
    }
};
