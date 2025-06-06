const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const tableManager = require('../utils/tableManager');
const config = require('../config');

module.exports = {
        data: new SlashCommandBuilder()
          .setName('adminreserve')
          .setDescription('Admin: Reserve a specific table for players')
          .addIntegerOption(option =>
              option.setName('table')
                  .setDescription('Table number to reserve')
                  .setRequired(true)
                  .setMinValue(1))
          .addUserOption(option =>
              option.setName('player1')
                  .setDescription('First player')
                  .setRequired(true))
          .addStringOption(option =>
              option.setName('game')
                  .setDescription('Name of the game they will be playing')
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
                .setDescription('Name of the game they will be playing')
                .setRequired(true)),
  
    async execute(interaction) {
        const userId = interaction.user.id;
        
        // Check if user is admin
        const isAdmin = await this.checkIfUserIsAdmin(userId, interaction);
        if (!isAdmin) {
            await interaction.reply({ 
                content: 'You do not have permission to use this command. This command is restricted to administrators.', 
                ephemeral: true 
            });
            return;
        }
        
        const tableNumber = interaction.options.getInteger('table');
        const gameName = interaction.options.getString('game');
        
        // Collect all mentioned players
        const players = [];
        for (let i = 1; i <= 6; i++) {
            const player = interaction.options.getUser(`player${i}`);
            if (player) {
                players.push(player);
            }
        }
        
        try {
            const result = await this.processAdminReservation(tableNumber, players, gameName);
            await interaction.reply(result);
        } catch (error) {
            console.error('Error in adminreserve command:', error);
            await interaction.reply({ content: 'An error occurred while processing the reservation. Please try again.', ephemeral: true });
        }
    },
    
    async handleDM(message, args) {
        const userId = message.author.id;
        
        // Check if user is admin
        const isAdmin = await this.checkIfUserIsAdmin(userId);
        if (!isAdmin) {
            await message.reply('You do not have permission to use this command. This command is restricted to administrators.');
            return;
        }
        
        if (args.length < 3) {
            await message.reply('Usage: !adminreserve <table_number> <player1, player2, ...> + <game_name>');
            return;
        }
        
        try {
            const tableNumber = parseInt(args[0]);
            const detailsText = args.slice(1).join(' ');
            
            if (isNaN(tableNumber)) {
                await message.reply('Please provide a valid table number.');
                return;
            }
            
            // Parse details - expected format: "Player1, Player2 + Game Name"
            let playerNames, gameName;
            
            if (detailsText.includes('+')) {
                const parts = detailsText.split('+');
                playerNames = parts[0].trim();
                gameName = parts[1].trim();
            } else {
                await message.reply('Please use the format: !adminreserve <table_number> <player1, player2, ...> + <game_name>');
                return;
            }
            
            const result = await this.processAdminReservationDM(tableNumber, playerNames, gameName);
            await message.reply(result);
        } catch (error) {
            console.error('Error in adminreserve DM command:', error);
            await message.reply('An error occurred while processing the reservation. Please try again.');
        }
    },
    
    async processAdminReservation(tableNumber, players, gameName) {
        // Validate the input
        if (!players || players.length === 0) {
            return 'Please provide at least one player.';
        }
        
        if (!gameName || gameName.trim() === '') {
            return 'Please provide a game name.';
        }
        
        if (tableNumber < 1) {
            return 'Please provide a valid table number (1 or higher).';
        }
        
        // Check if the specific table is already reserved
        const allReservations = tableManager.getAllReservations();
        const existingReservation = allReservations.find(reservation => reservation.tableNumber === tableNumber);
        
        if (existingReservation) {
            return `Table ${tableNumber} is already reserved by ${existingReservation.playerNames} for ${existingReservation.gameName}.`;
        }
        
        // Build player names string from Discord users
        const playerNames = players.map(player => player.displayName || player.username).join(', ');
        const primaryPlayer = players[0];
        
        // Create the reservation using the first player as the primary user
        const assignedTableNumber = tableManager.addReservationToSpecificTable(
            primaryPlayer.id, 
            primaryPlayer.displayName || primaryPlayer.username, 
            playerNames, 
            gameName.trim(), 
            tableNumber
        );
        
        if (assignedTableNumber === -1) {
            return `Failed to reserve Table ${tableNumber}. It may already be taken or the table number is invalid.`;
        }
        
        return `Table ${tableNumber} has been reserved for ${playerNames} playing ${gameName}. Reservation created by admin.`;
    },
    
    async processAdminReservationDM(tableNumber, playerNames, gameName) {
        // Validate the input
        if (!playerNames || playerNames.trim() === '') {
            return 'Please provide at least one player name.';
        }
        
        if (!gameName || gameName.trim() === '') {
            return 'Please provide a game name.';
        }
        
        if (tableNumber < 1) {
            return 'Please provide a valid table number (1 or higher).';
        }
        
        // Check if the specific table is already reserved
        const allReservations = tableManager.getAllReservations();
        const existingReservation = allReservations.find(reservation => reservation.tableNumber === tableNumber);
        
        if (existingReservation) {
            return `Table ${tableNumber} is already reserved by ${existingReservation.playerNames} for ${existingReservation.gameName}.`;
        }
        
        // Create the reservation with a dummy user ID for admin reservations
        const assignedTableNumber = tableManager.addReservationToSpecificTable(
            'admin_' + Date.now(), 
            'Admin Booking', 
            playerNames.trim(), 
            gameName.trim(), 
            tableNumber
        );
        
        if (assignedTableNumber === -1) {
            return `Failed to reserve Table ${tableNumber}. It may already be taken or the table number is invalid.`;
        }
        
        return `Table ${tableNumber} has been reserved for ${playerNames} playing ${gameName}. Reservation created by admin.`;
    },
    
    async checkIfUserIsAdmin(userId, interaction = null) {
        try {
            if (interaction && interaction.member) {
                // Check if user has administrator permission
                if (interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                    return true;
                }
                
                // Check if user has the admin role
                if (config.ADMIN_ROLE_ID && config.ADMIN_ROLE_ID !== 'YOUR_ADMIN_ROLE_ID_HERE') {
                    return interaction.member.roles.cache.has(config.ADMIN_ROLE_ID);
                }
            }
            
            // Fallback: try to get member info through client
            const { client } = require('../index');
            const guilds = client.guilds.cache;
            
            for (const guild of guilds.values()) {
                try {
                    const member = await guild.members.fetch(userId);
                    if (member) {
                        // Check if user has administrator permission
                        if (member.permissions.has(PermissionFlagsBits.Administrator)) {
                            return true;
                        }
                        
                        // Check if user has the admin role
                        if (config.ADMIN_ROLE_ID && config.ADMIN_ROLE_ID !== 'YOUR_ADMIN_ROLE_ID_HERE') {
                            if (member.roles.cache.has(config.ADMIN_ROLE_ID)) {
                                return true;
                            }
                        }
                    }
                } catch (error) {
                    console.error(`Error fetching member ${userId} from guild ${guild.name}:`, error);
                }
            }
            
            return false;
        } catch (error) {
            console.error('Error checking admin status:', error);
            return false;
        }
    }
};