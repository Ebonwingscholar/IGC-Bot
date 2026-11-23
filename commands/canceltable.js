const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const tableManager = require('../utils/tableManager');
const eventManager = require('../utils/eventManager');
const fs = require('fs');
const path = require('path');

const activeCancelFlows = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('canceltable')
        .setDescription('Admin: Interactively cancel or clear a table booking'),

    async execute(interaction) {
        const isAdmin = await tableManager.checkIfUserIsAdmin(interaction.user.id, interaction);
        if (!isAdmin) {
            return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
        }

        const typeMenu = new StringSelectMenuBuilder()
            .setCustomId('admincancel_type')
            .setPlaceholder('📂 Select cancellation category...')
            .addOptions([
                { label: 'Club Event Date', value: 'event', description: 'Clear a table from a custom club event', emoji: '📅' },
                { label: 'Thursday Club Night', value: 'thursday', description: 'Clear a standard Thursday night table', emoji: '🍺' }
            ]);

        await interaction.reply({
            content: '❌ **Admin Table Cancellation**\nStep 1 of 3: Choose the night category:',
            components: [new ActionRowBuilder().addComponents(typeMenu)],
            ephemeral: true
        });
    },

    async handleSelectMenu(interaction) {
        await interaction.deferUpdate();

        if (interaction.customId === 'admincancel_type') {
            const type = interaction.values[0];
            activeCancelFlows.set(interaction.user.id, { type });

            if (type === 'event') {
                const events = eventManager.getUpcomingEvents();
                if (events.length === 0) {
                    return interaction.editReply({ content: '❌ No upcoming events found.', components: [] });
                }

                const eventMenu = new StringSelectMenuBuilder()
                    .setCustomId('admincancel_date')
                    .setPlaceholder('📅 Select event date...')
                    .addOptions(
                        events.map(e => new StringSelectMenuOptionBuilder()
                            .setLabel(e.label)
                            .setValue(e.value)
                        )
                    );

                await interaction.editReply({
                    content: '❌ **Admin Table Cancellation**\nStep 2 of 3: Select event date:',
                    components: [new ActionRowBuilder().addComponents(eventMenu)]
                });
            } else {
                // Thursdays
                const options = [];
                let d = new Date();
                for (let i = 0; i < 6; i++) {
                    const day = d.getDay();
                    const diff = (4 - day + 7) % 7;
                    d.setDate(d.getDate() + diff);
                    if (i === 0 && day > 4) d.setDate(d.getDate() + 7);
                    
                    const dateStr = d.toISOString().split('T')[0];
                    options.push(new StringSelectMenuOptionBuilder().setLabel(dateStr).setValue(dateStr));
                    d.setDate(d.getDate() + 7);
                }

                const thursdayMenu = new StringSelectMenuBuilder()
                    .setCustomId('admincancel_date')
                    .setPlaceholder('📅 Select Thursday date...')
                    .addOptions(options);

                await interaction.editReply({
                    content: '❌ **Admin Table Cancellation**\nStep 2 of 3: Select Thursday date:',
                    components: [new ActionRowBuilder().addComponents(thursdayMenu)]
                });
            }
        }
        else if (interaction.customId === 'admincancel_date') {
            const date = interaction.values[0];
            const flow = activeCancelFlows.get(interaction.user.id) || {};
            flow.date = date;
            activeCancelFlows.set(interaction.user.id, flow);

            const bookingOptions = [];

            if (flow.type === 'event') {
                const eventData = eventManager.getEventData(date);
                for (let i = 1; i <= eventManager.MAX_TABLES; i++) {
                    const t = eventData.tables[i];
                    if (t.am) {
                        bookingOptions.push(new StringSelectMenuOptionBuilder()
                            .setLabel(`Table ${i} (AM) — ${t.am.gameName}`)
                            .setDescription(`Host: ${t.am.organizerName}`)
                            .setValue(`${i}_AM`)
                        );
                    }
                    if (t.pm) {
                        bookingOptions.push(new StringSelectMenuOptionBuilder()
                            .setLabel(`Table ${i} (PM) — ${t.pm.gameName}`)
                            .setDescription(`Host: ${t.pm.organizerName}`)
                            .setValue(`${i}_PM`)
                        );
                    }
                }
            } else {
                const reservations = tableManager.getAllReservations(date);
                reservations.forEach(r => {
                    bookingOptions.push(new StringSelectMenuOptionBuilder()
                        .setLabel(`Table ${r.tableNumber} (${r.session || 'Evening'}) — ${r.gameName}`)
                        .setDescription(`Players: ${r.playerNames}`)
                        .setValue(`${r.tableNumber}_${r.id}`)
                    );
                });
            }

            if (bookingOptions.length === 0) {
                return interaction.editReply({
                    content: `❌ There are no active bookings found on **${date}** to cancel.`,
                    components: []
                });
            }

            const cancelMenu = new StringSelectMenuBuilder()
                .setCustomId('admincancel_target')
                .setPlaceholder('Select booking to cancel...')
                .addOptions(bookingOptions);

            await interaction.editReply({
                content: `❌ **Admin Table Cancellation** (Date: **${date}**)\nStep 3 of 3: Select the booking to clear:`,
                components: [new ActionRowBuilder().addComponents(cancelMenu)]
            });
        }
        else if (interaction.customId === 'admincancel_target') {
            const flow = activeCancelFlows.get(interaction.user.id);
            const val = interaction.values[0];

            let successMsg = '';

            if (flow.type === 'event') {
                const [tableStr, slot] = val.split('_');
                const tableNumber = parseInt(tableStr);
                const eventData = eventManager.getEventData(flow.date);

                if (slot === 'AM') eventData.tables[tableNumber].am = null;
                if (slot === 'PM') eventData.tables[tableNumber].pm = null;

                const filePath = path.join(__dirname, '../data/event-bookings.json');
                const fullData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                fullData[flow.date] = eventData;
                fs.writeFileSync(filePath, JSON.stringify(fullData, null, 2));

                successMsg = `✅ **Admin Override:** Cleared Table ${tableNumber} (${slot}) on **${flow.date}**.`;
            } else {
                const [tableStr, reservationId] = val.split('_');
                tableManager.removeReservationById(reservationId);
                successMsg = `✅ **Admin Override:** Cancelled reservation for Table ${tableStr} on **${flow.date}**.`;
            }

            activeCancelFlows.delete(interaction.user.id);

            await interaction.editReply({
                content: successMsg,
                components: []
            });
        }
    }
};
