const { 
    SlashCommandBuilder, 
    ActionRowBuilder, 
    StringSelectMenuBuilder, 
    StringSelectMenuOptionBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');
const tableManager = require('../utils/tableManager');
const eventManager = require('../utils/eventManager');
const fs = require('fs');
const path = require('path');

// Temporary state store for admin reservation wizard
const activeAdminReserves = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('adminreserve')
        .setDescription('Admin: Interactively reserve a table on behalf of someone'),

    async execute(interaction) {
        const isAdmin = await tableManager.checkIfUserIsAdmin(interaction.user.id, interaction);
        if (!isAdmin) {
            return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
        }

        const typeMenu = new StringSelectMenuBuilder()
            .setCustomId('adminres_type')
            .setPlaceholder('📂 Select reservation category...')
            .addOptions([
                { label: 'Club Event Date', value: 'event', description: 'Book a table for a custom club event', emoji: '📅' },
                { label: 'Thursday Club Night', value: 'thursday', description: 'Book a standard Thursday night table', emoji: '🍺' }
            ]);

        await interaction.reply({
            content: '👑 **Admin Table Reservation**\nStep 1 of 4: Choose the category of night:',
            components: [new ActionRowBuilder().addComponents(typeMenu)],
            ephemeral: true
        });
    },

    async handleSelectMenu(interaction) {
        // CRITICAL FIX: If the user selected the slot, we must show the modal immediately 
        // without calling deferUpdate(), because modals cannot follow a deferred update.
        if (interaction.customId === 'adminres_slot') {
            const slot = interaction.values[0];
            const flow = activeAdminReserves.get(interaction.user.id) || {};
            flow.slot = slot;
            activeAdminReserves.set(interaction.user.id, flow);

            const modal = new ModalBuilder()
                .setCustomId('adminres_modal')
                .setTitle('Admin Table Override Details');

            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('modal_players')
                        .setLabel('Player / Host Name(s)')
                        .setPlaceholder('e.g. Ross Silvers, John Doe')
                        .setRequired(true)
                        .setStyle(TextInputStyle.Short)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('modal_game')
                        .setLabel('Game System / Title')
                        .setPlaceholder('e.g. BattleTech 3025')
                        .setRequired(true)
                        .setStyle(TextInputStyle.Short)
                )
            );

            return interaction.showModal(modal);
        }

        // For all other menu steps, safe to defer update to prevent timeout
        await interaction.deferUpdate();

        if (interaction.customId === 'adminres_type') {
            const type = interaction.values[0];
            activeAdminReserves.set(interaction.user.id, { type });

            if (type === 'event') {
                const events = eventManager.getUpcomingEvents();
                if (events.length === 0) {
                    return interaction.editReply({ content: '❌ There are no upcoming club events scheduled.', components: [] });
                }

                const eventMenu = new StringSelectMenuBuilder()
                    .setCustomId('adminres_event_date')
                    .setPlaceholder('📅 Select an event date...')
                    .addOptions(
                        events.map(e => new StringSelectMenuOptionBuilder()
                            .setLabel(e.label)
                            .setValue(e.value)
                        )
                    );

                await interaction.editReply({
                    content: '👑 **Admin Table Reservation**\nStep 2 of 4: Select the event date:',
                    components: [new ActionRowBuilder().addComponents(eventMenu)]
                });
            } else {
                // Generate upcoming Thursdays
                const options = [];
                let d = new Date();
                for (let i = 0; i < 6; i++) {
                    const day = d.getDay();
                    const diff = (4 - day + 7) % 7; // 4 = Thursday
                    d.setDate(d.getDate() + diff);
                    if (i === 0 && day > 4) d.setDate(d.getDate() + 7);
                    
                    const dateStr = d.toISOString().split('T')[0];
                    options.push(new StringSelectMenuOptionBuilder().setLabel(dateStr).setValue(dateStr));
                    d.setDate(d.getDate() + 7);
                }

                const thursdayMenu = new StringSelectMenuBuilder()
                    .setCustomId('adminres_thursday_date')
                    .setPlaceholder('📅 Select a Thursday...')
                    .addOptions(options);

                await interaction.editReply({
                    content: '👑 **Admin Table Reservation**\nStep 2 of 4: Select Thursday date:',
                    components: [new ActionRowBuilder().addComponents(thursdayMenu)]
                });
            }
        }
        else if (interaction.customId === 'adminres_event_date' || interaction.customId === 'adminres_thursday_date') {
            const date = interaction.values[0];
            const flow = activeAdminReserves.get(interaction.user.id) || {};
            flow.date = date;
            activeAdminReserves.set(interaction.user.id, flow);

            // Table Selection (1 to 12)
            const tableOptions = [];
            for (let i = 1; i <= 12; i++) {
                tableOptions.push(new StringSelectMenuOptionBuilder().setLabel(`Table ${i}`).setValue(`${i}`));
            }

            const tableMenu = new StringSelectMenuBuilder()
                .setCustomId('adminres_table')
                .setPlaceholder('📌 Select table number...')
                .addOptions(tableOptions);

            await interaction.editReply({
                content: `👑 **Admin Table Reservation** (Date: **${date}**)\nStep 3 of 4: Select table number:`,
                components: [new ActionRowBuilder().addComponents(tableMenu)]
            });
        }
        else if (interaction.customId === 'adminres_table') {
            const tableNumber = interaction.values[0];
            const flow = activeAdminReserves.get(interaction.user.id) || {};
            flow.tableNumber = parseInt(tableNumber);
            activeAdminReserves.set(interaction.user.id, flow);

            const slotMenu = new StringSelectMenuBuilder()
                .setCustomId('adminres_slot')
                .setPlaceholder('⏱️ Select session slot...')
                .addOptions(
                    flow.type === 'event' 
                        ? [
                            { label: 'Morning (AM)', value: 'AM', description: '09:00 - 13:00' },
                            { label: 'Afternoon (PM)', value: 'PM', description: '13:30 - 17:30' },
                            { label: 'Whole Day', value: 'Whole Day', description: '09:00 - 17:30' }
                          ]
                        : [
                            { label: 'Evening (18:00 - 22:00)', value: 'Evening 18:00-22:00' }
                          ]
                );

            await interaction.editReply({
                content: `👑 **Admin Table Reservation** (Table **${tableNumber}** on **${flow.date}**)\nStep 4 of 4: Select time slot:`,
                components: [new ActionRowBuilder().addComponents(slotMenu)]
            });
        }
    },

    async handleModalSubmit(interaction) {
        if (interaction.customId !== 'adminres_modal') return;

        await interaction.deferReply({ ephemeral: true });

        const flow = activeAdminReserves.get(interaction.user.id);
        if (!flow) {
            return interaction.editReply({ content: '❌ Session expired. Please run `/adminreserve` again.' });
        }

        const playerNames = interaction.fields.getTextInputValue('modal_players').trim();
        const gameName = interaction.fields.getTextInputValue('modal_game').trim();
        const adminId = interaction.user.id;

        try {
            if (flow.type === 'event') {
                const eventData = eventManager.getEventData(flow.date);
                const eventSlotData = {
                    organizerId: adminId,
                    organizerName: playerNames,
                    gameName: gameName,
                    maxPlayers: 8,
                    players: [{ id: adminId, name: playerNames }]
                };

                if (flow.slot === 'Whole Day') {
                    eventData.tables[flow.tableNumber].am = eventSlotData;
                    eventData.tables[flow.tableNumber].pm = eventSlotData;
                } else if (flow.slot === 'AM') {
                    eventData.tables[flow.tableNumber].am = eventSlotData;
                } else {
                    eventData.tables[flow.tableNumber].pm = eventSlotData;
                }

                const filePath = path.join(__dirname, '../data/event-bookings.json');
                const fullData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                fullData[flow.date] = eventData;
                fs.writeFileSync(filePath, JSON.stringify(fullData, null, 2));
            } else {
                tableManager.addReservationToSpecificTable(
                    adminId,
                    'Admin Booking',
                    playerNames,
                    gameName,
                    flow.tableNumber,
                    flow.date,
                    flow.slot
                );
            }

            activeAdminReserves.delete(interaction.user.id);

            await interaction.editReply({
                content: `✅ **Admin Override Successful!**\nReserved **Table ${flow.tableNumber}** for **${playerNames}** playing **${gameName}** on **${flow.date}** (${flow.slot}).`
            });
        } catch (err) {
            await interaction.editReply({ content: `❌ Error processing reservation: ${err.message}` });
        }
    }
};
