const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../data/event-bookings.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stopevent')
        .setDescription('Admin: Clear all table bookings for a specific event date')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addStringOption(option =>
            option.setName('date')
                  .setDescription('Event date to clear (Format: YYYY-MM-DD)')
                  .setRequired(true)),

    async execute(interaction) {
        const dateStr = interaction.options.getString('date').trim();

        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            return interaction.reply({ 
                content: '❌ Invalid date format. Please use `YYYY-MM-DD` (e.g. `2026-11-15`).', 
                ephemeral: true 
            });
        }

        try {
            if (!fs.existsSync(filePath)) {
                return interaction.reply({ content: `⚠️ No event bookings file found.`, ephemeral: true });
            }

            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

            if (!data[dateStr]) {
                return interaction.reply({ content: `⚠️ No active table bookings found for **${dateStr}**.`, ephemeral: true });
            }

            // Remove the date entry entirely from event-bookings.json
            delete data[dateStr];
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

            return interaction.reply({ 
                content: `✅ All table bookings and reservations for event date **${dateStr}** have been cleared and cancelled.`, 
                ephemeral: true 
            });
        } catch (err) {
            console.error('Error clearing event date:', err);
            return interaction.reply({ content: `❌ Error clearing event date: ${err.message}`, ephemeral: true });
        }
    }
};
