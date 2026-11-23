const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../data/event-bookings.json');

function getData() {
    if (!fs.existsSync(filePath)) return {};
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return {};
    }
}

function saveData(data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('createevent')
        .setDescription('Admin: Create a named club event for a specific date')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addStringOption(option =>
            option.setName('date')
                  .setDescription('Event date (Format: YYYY-MM-DD)')
                  .setRequired(true))
        .addStringOption(option =>
            option.setName('name')
                  .setDescription('Event name (e.g. Winter Wargaming All-Dayer)')
                  .setRequired(true)),

    async execute(interaction) {
        const dateStr = interaction.options.getString('date').trim();
        const eventName = interaction.options.getString('name').trim();

        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            return interaction.reply({ 
                content: '❌ Invalid date format. Please use `YYYY-MM-DD` (e.g. `2026-11-15`).', 
                ephemeral: true 
            });
        }

        const data = getData();
        
        // Initialize date entry if it doesn't exist
        if (!data[dateStr]) {
            data[dateStr] = { eventName: eventName, tables: {} };
            for (let i = 1; i <= 12; i++) {
                data[dateStr].tables[i] = { am: null, pm: null };
            }
        } else {
            data[dateStr].eventName = eventName;
        }

        saveData(data);

        await interaction.reply({ 
            content: `✅ Successfully created event **"${eventName}"** for **${dateStr}**! Members can now use \`/bookevent\` to book tables.`, 
            ephemeral: true 
        });
    }
};
