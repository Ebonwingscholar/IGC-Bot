const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const eventManager = require('../utils/eventManager');

// Active flows for user cancellation state
const activeCancelFlows = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('canceleventbooking')
        .setDescription('Cancel your table booking or player spot for an upcoming event'),

    async execute(interaction) {
        const events = eventManager.getUpcomingEvents();

        if (events.length === 0) {
            return interaction.reply({
                content: '❌ There are currently no upcoming events scheduled.',
                ephemeral: true
            });
        }

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('cancelevent_select_date')
            .setPlaceholder('📅 Select an event date...')
            .addOptions(
                events.map(e => new StringSelectMenuOptionBuilder()
                    .setLabel(e.label)
                    .setValue(e.value)
                )
            );

        await interaction.reply({
            content: '❌ **Cancel Event Booking**\nStep 1 of 2: Select the event date you want to cancel a booking for:',
            components: [new ActionRowBuilder().addComponents(selectMenu)],
            ephemeral: true
        });
    },

    async handleSelectMenu(interaction) {
        // Prevent 3-second timeout immediately
        await interaction.deferUpdate();

        // Step 1: Date Selected -> Find user's active bookings on that date
        if (interaction.customId === 'cancelevent_select_date') {
            const dateStr = interaction.values[0];
            const eventData = eventManager.getEventData(dateStr);
            const userBookings = [];

            // Check tables where user is host or player
            for (let i = 1; i <= eventManager.MAX_TABLES; i++) {
                const t = eventData.tables[i];
                ['am', 'pm'].forEach(slot => {
                    if (t[slot] && t[slot].players.some(p => p.id === interaction.user.id)) {
                        const isOrganizer = t[slot].organizerId === interaction.user.id;
                        userBookings.push({
                            label: `Table ${i} (${slot.toUpperCase()}) — ${t[slot].gameName}`,
                            description: isOrganizer ? 'Role: Organizer (Cancels table)' : 'Role: Player (Leaves table)',
                            value: `${i}_${slot}`
                        });
                    }
                });
            }

            if (userBookings.length === 0) {
                return interaction.editReply({
                    content: `❌ You do not have any active table bookings or registrations for **${dateStr}**.`,
                    components: []
                });
            }

            activeCancelFlows.set(interaction.user.id, { dateStr });

            const bookingMenu = new StringSelectMenuBuilder()
                .setCustomId('cancelevent_select_booking')
                .setPlaceholder('Select booking to cancel or leave...')
                .addOptions(
                    userBookings.map(b => new StringSelectMenuOptionBuilder()
                        .setLabel(b.label)
                        .setDescription(b.description)
                        .setValue(b.value)
                    )
                );

            await interaction.editReply({
                content: `📅 Event Date: **${dateStr}**\n\nStep 2 of 2: Select the booking you wish to cancel or leave:`,
                components: [new ActionRowBuilder().addComponents(bookingMenu)]
            });
        }
        // Step 2: Booking Selected -> Process Cancellation or Departure
        else if (interaction.customId === 'cancelevent_select_booking') {
            const flow = activeCancelFlows.get(interaction.user.id);
            if (!flow) {
                return interaction.editReply({ content: '❌ Cancellation session expired. Please run `/canceleventbooking` again.', components: [] });
            }

            const [tableNumStr, slot] = interaction.values[0].split('_');
            const tableNum = parseInt(tableNumStr);
            const data = eventManager.getEventData(flow.dateStr);
            const slotData = data.tables[tableNum][slot];

            if (!slotData) {
                activeCancelFlows.delete(interaction.user.id);
                return interaction.editReply({ content: '❌ Booking not found or already cancelled.', components: [] });
            }

            let resultMsg = '';

            // If user is organizer, clear the slot (and remove from whole day if applicable)
            if (slotData.organizerId === interaction.user.id) {
                if (data.tables[tableNum].am && data.tables[tableNum].pm &&
                    data.tables[tableNum].am.organizerId === interaction.user.id &&
                    data.tables[tableNum].pm.organizerId === interaction.user.id) {
                    data.tables[tableNum].am = null;
                    data.tables[tableNum].pm = null;
                    resultMsg = `✅ Cancelled your Whole Day table booking on **Table ${tableNum}** for **${flow.dateStr}**.`;
                } else {
                    data.tables[tableNum][slot] = null;
                    resultMsg = `✅ Cancelled your **${slot.toUpperCase()}** table booking on **Table ${tableNum}** for **${flow.dateStr}**.`;
                }
            } else {
                // User is a player joining, remove them from roster
                slotData.players = slotData.players.filter(p => p.id !== interaction.user.id);
                resultMsg = `✅ You have left **Table ${tableNum}** (${slotData.gameName}) for **${flow.dateStr}**.`;
            }

            // Save updated JSON state
            const fs = require('fs');
            const path = require('path');
            const filePath = path.join(__dirname, '../data/event-bookings.json');
            const fullData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            fullData[flow.dateStr] = data;
            fs.writeFileSync(filePath, JSON.stringify(fullData, null, 2));

            activeCancelFlows.delete(interaction.user.id);

            await interaction.editReply({
                content: resultMsg,
                components: []
            });
        }
    }
};
