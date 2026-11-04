const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const tableManager = require('../utils/tableManager');
const { isValidDate } = require('../utils/dateUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('view')
        .setDescription('View current table reservations')
        .addStringOption(option => option.setName('date').setDescription('Filter date (YYYY-MM-DD)').setRequired(false)),
    
    async execute(interaction) {
        try {
            const date = interaction.options.getString('date');
            if (date && !isValidDate(date)) {
                await interaction.reply({ content: '❌ Please provide a valid calendar date in YYYY-MM-DD format.', ephemeral: true });
                return;
            }

            const embeds = this.createReservationEmbeds(date);
            if (embeds.length === 0) {
                await interaction.reply(`There are no current table reservations${date ? ` for ${date}` : ''}.`);
                return;
            }
            await interaction.reply({ embeds: [embeds[0]] });
            for (let i = 1; i < embeds.length; i++) {
                await interaction.followUp({ embeds: [embeds[i]] });
            }
        } catch (error) {
            console.error('Error in view command:', error);
            await interaction.reply({ content: 'An error occurred while retrieving reservations.', ephemeral: true });
        }
    },
    
    async handleDM(message) {
        try {
            const embeds = this.createReservationEmbeds();
            if (embeds.length === 0) {
                await message.reply('There are no current table reservations.');
                return;
            }
            for (const embed of embeds) {
                await message.reply({ embeds: [embed] });
            }
        } catch (error) {
            console.error('Error in view DM command:', error);
            await message.reply('An error occurred while retrieving reservations.');
        }
    },
    
    createReservationEmbeds(filterDate = null) {
        const reservations = tableManager.getAllReservations(filterDate);
        const embeds = [];
        if (reservations.length === 0) return embeds;
        
        const totalTables = tableManager.MAX_TABLES;
        
        const maxReservationsPerEmbed = 10;
        const totalEmbeds = Math.ceil(reservations.length / maxReservationsPerEmbed);
        
        for (let i = 0; i < totalEmbeds; i++) {
            const startIdx = i * maxReservationsPerEmbed;
            const endIdx = Math.min(startIdx + maxReservationsPerEmbed, reservations.length);
            const currentReservations = reservations.slice(startIdx, endIdx);
            
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(`Inverurie Gaming Club - Table Reservations ${filterDate ? `(${filterDate})` : ''}`)
                .setTimestamp();

            if (filterDate) {
                const reservedCount = reservations.length;
                const freeCount = totalTables - reservedCount;
                embed.setDescription(`**Status for ${filterDate}:** ${reservedCount}/${totalTables} tables reserved (${freeCount} available)`);
            } else {
                embed.setDescription(`**Current Table Reservations Schedule:**`);
            }
            
            currentReservations.forEach(res => {
                embed.addFields({
                    name: `Table ${res.tableNumber} — ${res.date} (${res.session || 'Evening'})`, 
                    value: `**Players:** ${res.playerNames}\n**Game:** ${res.gameName}\n**Reserved by:** ${res.username}`
                });
            });
            
            embed.setFooter({ text: `Page ${i+1}/${totalEmbeds}` });
            embeds.push(embed);
        }
        return embeds;
    }
};
