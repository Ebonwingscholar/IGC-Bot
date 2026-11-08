const { 
    SlashCommandBuilder, 
    ActionRowBuilder, 
    StringSelectMenuBuilder, 
    StringSelectMenuOptionBuilder,
    UserSelectMenuBuilder,
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
            content: '👑 **Admin Table Reservation**\nStep 1 of 5: Choose the category of night:',
            components: [new ActionRowBuilder().addComponents(typeMenu)],
            ephemeral: true
        });
    },

    async handleSelectMenu(interaction) {
        if (interaction.customId === 'adminres_slot') {
            await interaction.deferUpdate();
            const slot = interaction.values[0];
            const flow = activeAdminReserves.get(interaction.user.id) || {};
            flow.slot = slot;
            activeAdminReserves.set(interaction.user.id, flow);

            // STEP 4: Tag players using Discord User Select Menu
            const userSelect = new UserSelectMenuBuilder()
                .setCustomId('adminres_select_players')
                .setPlaceholder('👥 Select/tag players for this table (Max 8)...')
                .setMinValues(1)
                .setMaxValues(8);

            return interaction.editReply({
                content: `👑 **Admin Table Reservation** (Table **${flow.tableNumber}** on **${flow.date}** — ${flow.slot})\nStep 4 of 5: Select/tag the players for this roster:`,
                components: [new ActionRowBuilder().addComponents(userSelect)]
            });
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
                    content: '👑 **Admin Table Reservation**\nStep 2 of 5: Select the event date:',
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
                    content: '👑 **Admin Table Reservation**\nStep 2 of 5: Select Thursday date:',
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
                content: `👑 **Admin Table Reservation** (Date: **${date}**)\nStep 3 of 5: Select table number:`,
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
                content: `👑 **Admin Table Reservation** (Table **${tableNumber}** on **${flow.date}**)\nSelect time slot:`,
                components: [new ActionRowBuilder().addComponents(slotMenu)]
            });
        }
    },

    async handleUserSelect(interaction) {
        if (interaction.customId !== 'adminres_select_players') return;

        const flow = activeAdminReserves.get(interaction.user.id);
        if (!flow) {
            return interaction.reply({ content: '❌ Session expired. Please run `/adminreserve` again.', ephemeral: true });
        }

        // Map tagged users to structured roster
        const selectedUsers = interaction.users;
        const initialRoster = [];

        for (const [userId, user] of selectedUsers) {
            const member = interaction.guild ? await interaction.guild.members.fetch(userId).catch(() => null) : null;
            const displayName = member ? member.displayName : user.username;
            initialRoster.push({ id: userId, name: displayName });
        }

        flow.taggedRoster = initialRoster;
        activeAdminReserves.set(interaction.user.id, flow);

        // Step 5: Modal to prompt for Game System/Title
        const modal = new ModalBuilder()
            .setCustomId('adminres_game_modal')
            .setTitle('Admin Table Override Details');

        modal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('modal_game')
                    .setLabel('Game System / Title')
                    .setPlaceholder('e.g. BattleTech 3025, Warhammer 40k')
                    .setRequired(true)
                    .setStyle(TextInputStyle.Short)
            )
        );

        return interaction.showModal(modal);
    },

    async handleModalSubmit(interaction) {
        if (interaction.customId !== 'adminres_game_modal') return;

        await interaction.deferReply({ ephemeral: true });

        const flow = activeAdminReserves.get(interaction.user.id);
        if (!flow) {
            return interaction.editReply({ content: '❌ Session expired. Please run `/adminreserve` again.' });
        }

        const gameName = interaction.fields.getTextInputValue('modal_game').trim();
        const roster = flow.taggedRoster || [{ id: interaction.user.id, name: interaction.user.username }];
        const primaryHost = roster[0];

        try {
            if (flow.type === 'event') {
                const eventData = eventManager.getEventData(flow.date);
                const eventSlotData = {
                    organizerId: primaryHost.id,
                    organizerName: primaryHost.name,
                    gameName: gameName,
                    maxPlayers: 8,
                    players: roster
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
                const playerNamesString = roster.map(p => p.name).join(', ');
                tableManager.addReservationToSpecificTable(
                    primaryHost.id,
                    primaryHost.name,
                    playerNamesString,
                    gameName,
                    flow.tableNumber,
                    flow.date,
                    flow.slot
                );
            }

            activeAdminReserves.delete(interaction.user.id);

            const playerMentions = roster.map(p => `<@${p.id}>`).join(', ');
            await interaction.editReply({
                content: `✅ **Admin Override Successful!**\nReserved **Table ${flow.tableNumber}** for ${playerMentions} playing **${gameName}** on **${flow.date}** (${flow.slot}).`
            });
        } catch (err) {
            await interaction.editReply({ content: `❌ Error processing reservation: ${err.message}` });
        }
    }
};
