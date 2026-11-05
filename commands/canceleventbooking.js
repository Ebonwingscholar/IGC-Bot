const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../data/event-bookings.json');

function getEventBookings() {
    if (!fs.existsSync(filePath)) return {};
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return {};
    }
}

function saveEventBookings(data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('canceleventbooking')
        .setDescription('Cancel your table booking or registration for an upcoming club event'),

    async execute(interaction) {
        const userId = interaction.user.id;
        const data = getEventBookings();

        // Scan all dates and tables to find bookings belonging to this user
        const userBookings = [];
        for (const [dateStr, eventObj] of Object.entries(data)) {
            if (!eventObj.tables) continue;
            for (const [tableNum, tableObj] of Object.entries(eventObj.tables)) {
                ['am', 'pm'].forEach(slotKey => {
                    const slotData = tableObj[slotKey];
                    if (slotData && slotData.players.some(p => p.id === userId)) {
                        userBookings.push({
                            date: dateStr,
                            tableNumber: tableNum,
                            slot: slotKey.toUpperCase(),
                            gameName: slotData.gameName,
                            isOrganizer: slotData.organizerId === userId
                        });
                    }
                });
            }
        }

        if (userBookings.length === 0) {
            return interaction.reply({ 
                content: '❌ You do not have any active event table bookings or registrations to cancel.', 
                ephemeral: true 
            });
        }

        // Build a select menu showing all their active event slots
        const options = userBookings.map((b) => {
            const roleDesc = b.isOrganizer ? '(Host)' : '(Player)';
            return new StringSelectMenuOptionBuilder()
                .setLabel(`${b.date} - Table ${b.tableNumber} (${b.slot})`)
                .setDescription(`${b.gameName} ${roleDesc}`)
                .setValue(`${b.date}_${b.tableNumber}_${b.slot}`);
        });

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('cancel_event_selection')
            .setPlaceholder('Select the booking you wish to cancel...')
            .addOptions(options);

        await interaction.reply({
            content: '🗑️ **Cancel Event Booking**\nSelect the specific table session you want to leave or cancel:',
            components: [new ActionRowBuilder().addComponents(selectMenu)],
            ephemeral: true
        });
    },

    async handleSelectMenu(interaction) {
        if (interaction.customId !== 'cancel_event_selection') return;

        const [dateStr, tableNum, slotKeyUpper] = interaction.values[0].split('_');
        const slotKey = slotKeyUpper.toLowerCase();
        const userId = interaction.user.id;

        const data = getEventBookings();
        if (!data[dateStr] || !data[dateStr].tables || !data[dateStr].tables[tableNum]) {
            return interaction.update({ content: '❌ Booking not found or already cancelled.', components: [] });
        }

        const tableObj = data[dateStr].tables[tableNum];
        const slotData = tableObj[slotKey];

        if (!slotData) {
            return interaction.update({ content: '❌ This table slot is no longer active.', components: [] });
        }

        // Remove user from the players list
        slotData.players = slotData.players.filter(p => p.id !== userId);

        // If the user was the host (organizer) OR if no players are left, clear the slot
        if (slotData.organizerId === userId || slotData.players.length === 0) {
            tableObj[slotKey] = null;
            // If it was a Whole Day booking covering both AM and PM, clear the other slot too if tied to them
            const otherSlotKey = slotKey === 'am' ? 'pm' : 'am';
            if (tableObj[otherSlotKey] && tableObj[otherSlotKey].organizerId === userId) {
                tableObj[otherSlotKey] = null;
            }
        }

        saveEventBookings(data);

        await interaction.update({
            content: `✅ Successfully cancelled your booking for **Table ${tableNum} (${slotKeyUpper})** on **${dateStr}**!`,
            components: []
        });
    }
};
