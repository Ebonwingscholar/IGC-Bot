const { 
    SlashCommandBuilder, 
    PermissionFlagsBits,
    ActionRowBuilder, 
    StringSelectMenuBuilder, 
    StringSelectMenuOptionBuilder,
    UserSelectMenuBuilder,
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle
} = require('discord.js');
const eventManager = require('../utils/eventManager');

const activeAdminFlows = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('adminmanage')
        .setDescription('Admin: Create event tables or edit existing bookings, rosters, and game details')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        const events = eventManager.getUpcomingEvents();

        if (!events || events.length === 0) {
            return interaction.reply({ 
                content: '❌ No upcoming events found in the schedule system.', 
                ephemeral: true 
            });
        }

        const dateMenu = new StringSelectMenuBuilder()
            .setCustomId('adminmanage_select_date')
            .setPlaceholder('📅 Select event date...')
            .addOptions(
                events.map(e => new StringSelectMenuOptionBuilder().setLabel(e.label).setValue(e.value))
            );

        await interaction.reply({
            content: '🛠️ **Admin Table Manager**\nStep 1: Select the event date to manage:',
            components: [new ActionRowBuilder().addComponents(dateMenu)],
            ephemeral: true
        });
    },

    async handleSelectMenu(interaction) {
        // Step 1: Date Selected -> Option to Create New Table or Pick Existing Table Slot
        if (interaction.customId === 'adminmanage_select_date') {
            const dateStr = interaction.values[0];
            const eventData = eventManager.getEventData(dateStr);

            const menuOptions = [
                new StringSelectMenuOptionBuilder()
                    .setLabel('Create New Table for Players')
                    .setDescription('Set up a new event table and assign a host & roster')
                    .setValue('create_new_table')
                    .setEmoji('➕')
            ];

            for (let i = 1; i <= eventManager.MAX_TABLES; i++) {
                const t = eventData.tables[i];
                if (!t) continue;

                // Check if it's a unified Whole Day booking
                if (t.am && t.pm && t.am.organizerId === t.pm.organizerId && t.am.gameName === t.pm.gameName) {
                    menuOptions.push(
                        new StringSelectMenuOptionBuilder()
                            .setLabel(`Table ${i}: ${t.am.gameName} (Whole Day)`)
                            .setDescription(`Host: ${t.am.organizerName} | Players: ${t.am.players.length}/${t.am.maxPlayers}`)
                            .setValue(`${i}|Whole Day`)
                    );
                } else {
                    if (t.am) {
                        menuOptions.push(
                            new StringSelectMenuOptionBuilder()
                                .setLabel(`Table ${i} AM: ${t.am.gameName}`)
                                .setDescription(`Host: ${t.am.organizerName} | Players: ${t.am.players.length}/${t.am.maxPlayers}`)
                                .setValue(`${i}|AM`)
                        );
                    }
                    if (t.pm) {
                        menuOptions.push(
                            new StringSelectMenuOptionBuilder()
                                .setLabel(`Table ${i} PM: ${t.pm.gameName}`)
                                .setDescription(`Host: ${t.pm.organizerName} | Players: ${t.pm.players.length}/${t.pm.maxPlayers}`)
                                .setValue(`${i}|PM`)
                        );
                    }
                }
            }

            activeAdminFlows.set(interaction.user.id, { date: dateStr });

            const tableMenu = new StringSelectMenuBuilder()
                .setCustomId('adminmanage_select_table')
                .setPlaceholder('📌 Create a table or select a table slot to edit...')
                .addOptions(menuOptions);

            const statusNote = menuOptions.length === 1
                ? '*(No existing tables booked for this date yet — you can create one below.)*\n\n'
                : '';

            await interaction.update({
                content: `📅 Date: **${dateStr}**\n${statusNote}Step 2: Create a new table or select an existing table session to edit:`,
                components: [new ActionRowBuilder().addComponents(tableMenu)]
            });
        }
        // Step 2: Table Slot Selected (or Create New Table chosen)
        else if (interaction.customId === 'adminmanage_select_table') {
            const selectedValue = interaction.values[0];
            const flow = activeAdminFlows.get(interaction.user.id) || {};

            if (selectedValue === 'create_new_table') {
                flow.action = 'create_table';
                activeAdminFlows.set(interaction.user.id, flow);

                const slotMenu = new StringSelectMenuBuilder()
                    .setCustomId('adminmanage_create_slot')
                    .setPlaceholder('⏱️ Select time slot for the new table...')
                    .addOptions([
                        { label: 'Morning (AM)', value: 'AM', description: '10:00 - 14:00' },
                        { label: 'Afternoon (PM)', value: 'PM', description: '14:00 - 18:00' },
                        { label: 'Whole Day', value: 'Whole Day', description: '10:00 - 18:00' }
                    ]);

                return interaction.update({
                    content: `📅 Date: **${flow.date}** | ➕ **New Table**\n\nStep 3: Select the time slot:`,
                    components: [new ActionRowBuilder().addComponents(slotMenu)]
                });
            }

            const [tableNumStr, slot] = selectedValue.split('|');
            const tableNumber = parseInt(tableNumStr);
            flow.tableNumber = tableNumber;
            flow.slot = slot; // Explicitly holds 'AM', 'PM', or 'Whole Day'
            activeAdminFlows.set(interaction.user.id, flow);

            const actionMenu = new StringSelectMenuBuilder()
                .setCustomId('adminmanage_select_action')
                .setPlaceholder('⚙️ Choose management action...')
                .addOptions([
                    { label: `Add Player to ${slot} Roster`, value: 'add_player', emoji: '➕', description: `Select a user to add to Table ${tableNumber} (${slot})` },
                    { label: `Remove Player from ${slot} Roster`, value: 'remove_player', emoji: '➖', description: `Remove an existing player from Table ${tableNumber} (${slot})` },
                    { label: `Edit Details (${slot})`, value: 'edit_details', emoji: '📝', description: `Modify game title or capacity for Table ${tableNumber} (${slot})` }
                ]);

            await interaction.update({
                content: `📅 Date: **${flow.date}** | 📌 **Table ${tableNumber}** (${slot})\n\nStep 3: What action do you want to take?`,
                components: [new ActionRowBuilder().addComponents(actionMenu)]
            });
        }
        // New Table Branch: Slot Selected -> Pick Players (first selected = host)
        else if (interaction.customId === 'adminmanage_create_slot') {
            const slot = interaction.values[0];
            const flow = activeAdminFlows.get(interaction.user.id) || {};
            flow.slot = slot;
            activeAdminFlows.set(interaction.user.id, flow);

            const userSelect = new UserSelectMenuBuilder()
                .setCustomId('adminmanage_create_players')
                .setPlaceholder('👥 Select players (1st selected = Host, Max 8)...')
                .setMinValues(1)
                .setMaxValues(8);

            await interaction.update({
                content: `📅 Date: **${flow.date}** | ➕ **New Table** (${slot})\n\nStep 4: Select the players for this table (the first user selected will be the host):`,
                components: [new ActionRowBuilder().addComponents(userSelect)]
            });
        }
        // Step 3 (Existing Table): Action Selected
        else if (interaction.customId === 'adminmanage_select_action') {
            const action = interaction.values[0];
            const flow = activeAdminFlows.get(interaction.user.id) || {};
            flow.action = action;
            activeAdminFlows.set(interaction.user.id, flow);

            if (action === 'add_player') {
                const userSelect = new UserSelectMenuBuilder()
                    .setCustomId('adminmanage_add_user')
                    .setPlaceholder(`👤 Select member to add to ${flow.slot}...`)
                    .setMinValues(1)
                    .setMaxValues(1);

                await interaction.update({
                    content: `📅 Date: **${flow.date}** | 📌 **Table ${flow.tableNumber}** (${flow.slot})\n\nSelect a member to add:`,
                    components: [new ActionRowBuilder().addComponents(userSelect)]
                });
            } else if (action === 'remove_player') {
                const eventData = eventManager.getEventData(flow.date);
                const t = eventData.tables[flow.tableNumber];
                const slotKey = flow.slot === 'Whole Day' ? (t.am ? 'am' : 'pm') : flow.slot.toLowerCase();
                const slotData = t[slotKey];

                if (!slotData || slotData.players.length === 0) {
                    return interaction.update({
                        content: `❌ No players on roster for Table ${flow.tableNumber} (${flow.slot}).`,
                        components: []
                    });
                }

                const playerMenu = new StringSelectMenuBuilder()
                    .setCustomId('adminmanage_remove_user')
                    .setPlaceholder(`❌ Select player to remove from ${flow.slot}...`)
                    .addOptions(
                        slotData.players.map(p => new StringSelectMenuOptionBuilder()
                            .setLabel(p.name)
                            .setValue(p.id)
                            .setDescription(p.id === slotData.organizerId ? 'Table Organizer' : 'Player')
                        )
                    );

                await interaction.update({
                    content: `📅 Date: **${flow.date}** | 📌 **Table ${flow.tableNumber}** (${flow.slot})\n\nSelect player to remove:`,
                    components: [new ActionRowBuilder().addComponents(playerMenu)]
                });
            } else if (action === 'edit_details') {
                const eventData = eventManager.getEventData(flow.date);
                const t = eventData.tables[flow.tableNumber];
                const slotKey = flow.slot === 'Whole Day' ? (t.am ? 'am' : 'pm') : flow.slot.toLowerCase();
                const slotData = t[slotKey];

                const modal = new ModalBuilder()
                    .setCustomId('adminmanage_details_modal')
                    .setTitle(`Edit Table ${flow.tableNumber} (${flow.slot})`);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('modal_game_name')
                            .setLabel('Game System / Title')
                            .setValue(slotData ? slotData.gameName : '')
                            .setRequired(true)
                            .setStyle(TextInputStyle.Short)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('modal_max_players')
                            .setLabel('Max Player Capacity')
                            .setValue(slotData ? String(slotData.maxPlayers) : '8')
                            .setRequired(true)
                            .setStyle(TextInputStyle.Short)
                    )
                );

                return interaction.showModal(modal);
            }
        }
        // Action: Remove Player Executed
        else if (interaction.customId === 'adminmanage_remove_user') {
            const targetUserId = interaction.values[0];
            const flow = activeAdminFlows.get(interaction.user.id);

            try {
                const res = eventManager.adminRemovePlayer(flow.date, flow.tableNumber, flow.slot, targetUserId);
                activeAdminFlows.delete(interaction.user.id);

                if (res.freed) {
                    await interaction.update({
                        content: `✅ Removed <@${targetUserId}> from **Table ${flow.tableNumber}** (${flow.slot}). Roster was empty, so that slot is now free!`,
                        components: []
                    });
                } else {
                    await interaction.update({
                        content: `✅ Removed <@${targetUserId}> from **Table ${flow.tableNumber}** (${flow.slot}) roster on **${flow.date}**.`,
                        components: []
                    });
                }
            } catch (err) {
                await interaction.update({ content: `❌ ${err.message}`, components: [] });
            }
        }
    },

    async handleUserSelect(interaction) {
        const flow = activeAdminFlows.get(interaction.user.id);
        if (!flow) {
            return interaction.update({ content: '❌ Session expired. Please run `/adminmanage` again.', components: [] });
        }

        if (interaction.customId === 'adminmanage_create_players') {
            const roster = [];
            for (const [userId, user] of interaction.users) {
                const member = interaction.guild ? await interaction.guild.members.fetch(userId).catch(() => null) : null;
                const displayName = member ? member.displayName : user.username;
                roster.push({ id: userId, name: displayName });
            }

            flow.roster = roster;
            activeAdminFlows.set(interaction.user.id, flow);

            const modal = new ModalBuilder()
                .setCustomId('adminmanage_create_modal')
                .setTitle(`New Event Table (${flow.slot})`);

            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('modal_game_name')
                        .setLabel('Game System / Title')
                        .setPlaceholder('e.g. BattleTech, Marvel Crisis Protocol, Warhammer 40k')
                        .setRequired(true)
                        .setStyle(TextInputStyle.Short)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('modal_max_players')
                        .setLabel('Max Player Capacity (Default 8)')
                        .setValue('8')
                        .setRequired(true)
                        .setStyle(TextInputStyle.Short)
                )
            );

            return interaction.showModal(modal);
        }

        if (interaction.customId !== 'adminmanage_add_user') return;

        const selectedUser = interaction.users.first();
        const nickname = interaction.guild ? (await interaction.guild.members.fetch(selectedUser.id)).displayName : selectedUser.username;

        try {
            eventManager.adminAddPlayer(flow.date, flow.tableNumber, flow.slot, selectedUser.id, nickname);
            activeAdminFlows.delete(interaction.user.id);

            await interaction.update({
                content: `✅ Added <@${selectedUser.id}> (${nickname}) to **Table ${flow.tableNumber}** (${flow.slot}) on **${flow.date}**!`,
                components: []
            });
        } catch (err) {
            await interaction.update({ content: `❌ ${err.message}`, components: [] });
        }
    },

    async handleModalSubmit(interaction) {
        const flow = activeAdminFlows.get(interaction.user.id);
        if (!flow) {
            return interaction.reply({ content: '❌ Session expired. Please run `/adminmanage` again.', ephemeral: true });
        }

        if (interaction.customId === 'adminmanage_create_modal') {
            const gameName = interaction.fields.getTextInputValue('modal_game_name').trim();
            const maxPlayers = parseInt(interaction.fields.getTextInputValue('modal_max_players').trim()) || 8;
            const roster = flow.roster || [];
            const primaryHost = roster[0];
            const mentions = roster.map(p => `<@${p.id}>`).join(', ');

            try {
                const tableNum = eventManager.createBooking(
                    flow.date,
                    flow.slot,
                    primaryHost.id,
                    primaryHost.name,
                    gameName,
                    maxPlayers,
                    roster
                );
                activeAdminFlows.delete(interaction.user.id);

                await interaction.reply({
                    content: `🎉 **Admin Event Table Created!**\nReserved **Table ${tableNum}** (${flow.slot}) on **${flow.date}** for ${mentions} playing **${gameName}** (Host: **${primaryHost.name}**, Max Capacity: ${maxPlayers}).`,
                    ephemeral: true
                });
            } catch (err) {
                await interaction.reply({ content: `❌ ${err.message}`, ephemeral: true });
            }
            return;
        }

        if (interaction.customId !== 'adminmanage_details_modal') return;

        const gameName = interaction.fields.getTextInputValue('modal_game_name').trim();
        const maxPlayers = parseInt(interaction.fields.getTextInputValue('modal_max_players').trim()) || 8;

        try {
            eventManager.adminUpdateDetails(flow.date, flow.tableNumber, flow.slot, gameName, maxPlayers);
            activeAdminFlows.delete(interaction.user.id);

            await interaction.reply({
                content: `✅ Updated **Table ${flow.tableNumber}** (${flow.slot}) on **${flow.date}**!\n🎮 **Game:** ${gameName}\n👥 **Max Capacity:** ${maxPlayers}`,
                ephemeral: true
            });
        } catch (err) {
            await interaction.reply({ content: `❌ ${err.message}`, ephemeral: true });
        }
    }
};
