const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../data/closed-dates.json');

// Ensure data folder and file exist on command module load
function ensureStorageExists() {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify([], null, 2));
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('closedates')
        .setDescription('Manage closed club dates (Admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(sub =>
            sub.setName('add')
               .setDescription('Add a closed date (YYYY-MM-DD)')
               .addStringOption(opt => opt.setName('date').setDescription('Format: YYYY-MM-DD (e.g. 2026-12-24)').setRequired(true)))
        .addSubcommand(sub =>
            sub.setName('remove')
               .setDescription('Remove a closed date (YYYY-MM-DD)')
               .addStringOption(opt => opt.setName('date').setDescription('Format: YYYY-MM-DD').setRequired(true)))
        .addSubcommand(sub =>
            sub.setName('list')
               .setDescription('List all registered closed club dates')),

    async execute(interaction) {
        ensureStorageExists();
        const sub = interaction.options.getSubcommand();
        let dates = JSON.parse(fs.readFileSync(filePath, 'utf8'));

        if (sub === 'add') {
            const dateInput = interaction.options.getString('date').trim();
            if (!/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
                return interaction.reply({ 
                    content: '❌ Invalid date format. Please use `YYYY-MM-DD` (e.g. `2026-12-24`).', 
                    ephemeral: true 
                });
            }
            if (!dates.includes(dateInput)) {
                dates.push(dateInput);
                dates.sort();
                fs.writeFileSync(filePath, JSON.stringify(dates, null, 2));
            }
            return interaction.reply({ 
                content: `✅ Added **${dateInput}** to closed club dates. It will now be skipped by \`/reserve\`.`, 
                ephemeral: true 
            });
        }

        if (sub === 'remove') {
            const dateInput = interaction.options.getString('date').trim();
            dates = dates.filter(d => d !== dateInput);
            fs.writeFileSync(filePath, JSON.stringify(dates, null, 2));
            return interaction.reply({ 
                content: `✅ Removed **${dateInput}** from closed club dates.`, 
                ephemeral: true 
            });
        }

        if (sub === 'list') {
            if (dates.length === 0) {
                return interaction.reply({ 
                    content: '📅 No closed dates are currently set. Club is open on all fortnightly Thursdays.', 
                    ephemeral: true 
                });
            }
            return interaction.reply({ 
                content: `📅 **Closed Club Dates:**\n` + dates.map(d => `• ${d}`).join('\n'), 
                ephemeral: true 
            });
        }
    }
};
