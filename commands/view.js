const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const tableManager = require('../utils/tableManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('view')
        .setDescription('View all current table reservations'),
    
    async execute(interaction) {
        try {
            const embeds = this.createReservationEmbeds();
            
            if (embeds.length === 0) {
                await interaction.reply('There are no current table reservations.');
                return;
            }
            
            // Reply with the first embed
            await interaction.reply({ embeds: [embeds[0]] });
            
            // Send additional embeds as follow-ups if there are any
            for (let i = 1; i < embeds.length; i++) {
                await interaction.followUp({ embeds: [embeds[i]] });
            }
        } catch (error) {
            console.error('Error in view command:', error);
            await interaction.reply({ content: 'An error occurred while retrieving reservations. Please try again.', ephemeral: true });
        }
    },
    
    async handleDM(message) {
        try {
            const embeds = this.createReservationEmbeds();
            
            if (embeds.length === 0) {
                await message.reply('There are no current table reservations.');
                return;
            }
            
            // Send each embed
            for (const embed of embeds) {
                await message.reply({ embeds: [embed] });
            }
        } catch (error) {
            console.error('Error in view DM command:', error);
            await message.reply('An error occurred while retrieving reservations. Please try again.');
        }
    },
    
    createReservationEmbeds() {
        const reservations = tableManager.getAllReservations();
        const embeds = [];
        
        if (reservations.length === 0) {
            return embeds;
        }
        
        // Calculate free tables
        const totalTables = tableManager.MAX_TABLES;
        const reservedTables = reservations.length;
        const freeTables = totalTables - reservedTables;
        
        // Create embeds with max 10 reservations per embed
        const maxReservationsPerEmbed = 10;
        const totalEmbeds = Math.ceil(reservations.length / maxReservationsPerEmbed);
        
        for (let i = 0; i < totalEmbeds; i++) {
            const startIdx = i * maxReservationsPerEmbed;
            const endIdx = Math.min(startIdx + maxReservationsPerEmbed, reservations.length);
            const currentReservations = reservations.slice(startIdx, endIdx);
            
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('Wargaming Club Table Reservations')
                .setDescription(`**Current Status:** ${reservedTables}/${totalTables} tables reserved (${freeTables} available)`)
                .setTimestamp();
            
            currentReservations.forEach(res => {
                embed.addFields({
                    name: `Table ${res.tableNumber}`, 
                    value: `**Players:** ${res.playerNames}\n**Game:** ${res.gameName}\n**Reserved by:** ${res.username}`
                });
            });
            
            if (i === 0) {
                embed.setFooter({ text: `Page ${i+1}/${totalEmbeds} • Use !help for commands` });
            } else {
                embed.setFooter({ text: `Page ${i+1}/${totalEmbeds}` });
            }
            
            embeds.push(embed);
        }
        
        return embeds;
    }
};
