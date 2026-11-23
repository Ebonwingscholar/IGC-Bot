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
const fs = require('fs');
const path = require('path');
const tableManager = require('../utils/tableManager');
const eventManager = require('../utils/eventManager');

const activeAdminFlows = new Map();

function getUpcomingBiweeklyThursdays(count = 4) {
    const options = [];
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    let closedDates = [];
    const closedFilePath = path.join(__dirname, '../data/closed-dates.json');
    try {
        if (fs.existsSync(closedFilePath)) {
            closedDates = JSON.parse(fs.readFileSync(closedFilePath, 'utf8'));
        }
    } catch (err) {
        console.error('Error reading closed-dates.json:', err);
    }

    const formatDate = (dObj) => {
        const y = dObj.getFullYear();
        const m = String(dObj.getMonth() + 1).padStart(2, '0');
        const d = String(dObj.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    };

    // Anchor date: 5th Nov 2026 (matches /book)
    let currentThursday = new Date(2026, 10, 5);
    while (formatDate(currentThursday) < todayStr) {
        currentThursday.setDate(currentThursday.getDate() + 14);
    }

    while (options.length < count) {
        const dateStr = formatDate(currentThursday);
        if (!closedDates.includes(dateStr)) {
            options.push({
                label: `Thursday: ${dateStr}`,
                value: dateStr
            });
        }
        currentThursday.setDate(currentThursday.getDate() + 14);
    }

    return options;
}

function getThursdayReservation(dateStr, tableNumber) {
    return tableManager.reservations.find(
        r => r.date === dateStr && r.tableNumber === tableNumber
    );
}

function parsePlayerNames(playerNamesStr) {
    if (!playerNamesStr || typeof playerNamesStr !== 'string') return [];
    return playerNamesStr
        .split(',')
        .map(name => name.trim())
        .filter(Boolean);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('adminmanage')
        .setDescription('Admin: Create or edit Thursday and event table bookings, rosters, and game details')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        const scheduleMenu = new StringSelectMenuBuilder()
            .setCustomId('adminmanage_select_schedule_type')
            .setPlaceholder('🗓️ Choose Thursday or Special Event...')
            .addOptions([
                {
                    label: 'Thursday Club Night',
                    value: 'thursday',
                    description: 'Manage bi-weekly Thursday tables (no AM/PM split)',
                    emoji: '🍺'
                },
                {
                    label: 'Special Club Event',
                    value: 'event',
                    description: 'Manage special event tables (AM / PM / Whole Day)',
                    emoji: '📅'
                }
            ]);

        await interaction.reply({
            content: '🛠️ **Admin Table Manager**\nStep 1: Which schedule do you want to manage?',
            components: [new ActionRowBuilder().addComponents(scheduleMenu)],
            ephemeral: true
        });
    },

    async handleSelectMenu(interaction) {
        const userId = interaction.user.id;

        // --- STEP 1: Schedule Type Selected -> Pick Date ---
        if (interaction.customId === 'adminmanage_select_schedule_type') {
            const scheduleType = interaction.values[0];
            activeAdminFlows.set(userId, { scheduleType });

            if (scheduleType === 'event') {
                const events = eventManager.getUpcomingEvents();
                if (!events || events.length === 0) {
                    return interaction.update({
                        content: '❌ No upcoming special events found in the schedule system.',
                        components: []
                    });
                }

                const dateMenu = new StringSelectMenuBuilder()
                    .setCustomId('adminmanage_select_date')
                    .setPlaceholder('📅 Select event date...')
                    .addOptions(
                        events.slice(0, 25).map(e =>
                            new StringSelectMenuOptionBuilder().setLabel(e.label).setValue(e.value)
                        )
                    );

                return interaction.update({
                    content: '🛠️ **Admin Table Manager (Special Event)**\nStep 2: Select the event date:',
                    components: [new ActionRowBuilder().addComponents(dateMenu)]
                });
            }

            const thursdays = getUpcomingBiweeklyThursdays(4);
            const dateMenu = new StringSelectMenuBuilder()
                .setCustomId('adminmanage_select_date')
                .setPlaceholder('📅 Select Thursday date...')
                .addOptions(
                    thursdays.map(t =>
                        new StringSelectMenuOptionBuilder().setLabel(t.label).setValue(t.value)
                    )
                );

            return interaction.update({
                content: '🛠️ **Admin Table Manager (Thursday Club Night)**\nStep 2: Select the Thursday date:',
                components: [new ActionRowBuilder().addComponents(dateMenu)]
            });
        }

        // --- STEP 2: Date Selected -> Create New Table or Pick Existing Table ---
        else if (interaction.customId === 'adminmanage_select_date') {
            const dateStr = interaction.values[0];
            const flow = activeAdminFlows.get(userId) || { scheduleType: 'event' };
            flow.date = dateStr;
            activeAdminFlows.set(userId, flow);

            const menuOptions = [
                new StringSelectMenuOptionBuilder()
                    .setLabel('Create New Table for Players')
                    .setDescription(
                        flow.scheduleType === 'thursday'
                            ? 'Book a Thursday table for players and assign a host'
                            : 'Set up a new event table and assign a host & roster'
                    )
                    .setValue('create_new_table')
                    .setEmoji('➕')
            ];

            if (flow.scheduleType === 'event') {
                const eventData = eventManager.getEventData(dateStr);
                for (let i = 1; i <= eventManager.MAX_TABLES; i++) {
                    const t = eventData?.tables?.[i];
                    if (!t) continue;

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
            } else {
                const dayRes = tableManager.getAllReservations(dateStr);
                for (const res of dayRes) {
                    if (!res || !res.tableNumber) continue;
                    const rosterList = parsePlayerNames(res.playerNames);
                    menuOptions.push(
                        new StringSelectMenuOptionBuilder()
                            .setLabel(`Table ${res.tableNumber}: ${res.gameName || 'Booked Table'}`)
                            .setDescription(`Host: ${res.username} | Roster: ${rosterList.length ? rosterList.join(', ') : res.playerNames}`)
                            .setValue(`${res.tableNumber}|Thursday`)
                    );
                }
            }

            const tableMenu = new StringSelectMenuBuilder()
                .setCustomId('adminmanage_select_table')
                .setPlaceholder('📌 Create a table or select an existing table to edit...')
                .addOptions(menuOptions.slice(0, 25));

            const statusNote = menuOptions.length === 1
                ? '*(No existing bookings listed for this date yet — you can create one below.)*\n\n'
                : '';

            await interaction.update({
                content: `📅 Date: **${dateStr}** (${flow.scheduleType === 'thursday' ? 'Thursday' : 'Event'})\n${statusNote}Step 3: Create a new table or select an existing table to manage:`,
                components: [new ActionRowBuilder().addComponents(tableMenu)]
            });
        }

        // --- STEP 3: Table Selected (or Create New Table chosen) ---
        else if (interaction.customId === 'adminmanage_select_table') {
            const selectedValue = interaction.values[0];
            const flow = activeAdminFlows.get(userId) || { scheduleType: 'event' };

            if (selectedValue === 'create_new_table') {
                flow.action = 'create_table';
                activeAdminFlows.set(userId, flow);

                // Thursdays skip AM/PM slot selection and go straight to picking players
                if (flow.scheduleType === 'thursday') {
                    flow.slot = 'Thursday';
                    activeAdminFlows.set(userId, flow);

                    const userSelect = new UserSelectMenuBuilder()
                        .setCustomId('adminmanage_create_players')
                        .setPlaceholder('👥 Select players (1st selected = Host, Max 8)...')
                        .setMinValues(1)
                        .setMaxValues(8);

                    return interaction.update({
                        content: `📅 Date: **${flow.date}** (Thursday) | ➕ **New Table**\n\nStep 4: Select the players for this table (the first user selected will be the host):`,
                        components: [new ActionRowBuilder().addComponents(userSelect)]
                    });
                }

                const slotMenu = new StringSelectMenuBuilder()
                    .setCustomId('adminmanage_create_slot')
                    .setPlaceholder('⏱️ Select time slot for the new event table...')
                    .addOptions([
                        { label: 'Morning (AM)', value: 'AM', description: '10:00 - 14:00' },
                        { label: 'Afternoon (PM)', value: 'PM', description: '14:00 - 18:00' },
                        { label: 'Whole Day', value: 'Whole Day', description: '10:00 - 18:00' }
                    ]);

                return interaction.update({
                    content: `📅 Date: **${flow.date}** (Event) | ➕ **New Table**\n\nStep 4: Select the time slot:`,
                    components: [new ActionRowBuilder().addComponents(slotMenu)]
                });
            }

            const [tableNumStr, slot] = selectedValue.split('|');
            flow.tableNumber = parseInt(tableNumStr, 10);
            flow.slot = slot;
            activeAdminFlows.set(userId, flow);

            const slotLabel = flow.scheduleType === 'thursday' ? 'Thursday' : slot;
            const actionMenu = new StringSelectMenuBuilder()
                .setCustomId('adminmanage_select_action')
                .setPlaceholder('⚙️ Choose management action...')
                .addOptions([
                    { label: 'Add Player to Roster', value: 'add_player', emoji: '➕', description: `Select a member to add to Table ${flow.tableNumber} (${slotLabel})` },
                    { label: 'Remove Player from Roster', value: 'remove_player', emoji: '➖', description: `Remove a player from Table ${flow.tableNumber} (${slotLabel})` },
                    { label: 'Edit Table Details', value: 'edit_details', emoji: '📝', description: `Update game title for Table ${flow.tableNumber} (${slotLabel})` }
                ]);

            await interaction.update({
                content: `📅 Date: **${flow.date}** | 📌 **Table ${flow.tableNumber}** (${slotLabel})\n\nWhat action do you want to take?`,
                components: [new ActionRowBuilder().addComponents(actionMenu)]
            });
        }

        // --- EVENT ONLY: Slot Selected -> Pick Players ---
        else if (interaction.customId === 'adminmanage_create_slot') {
            const slot = interaction.values[0];
            const flow = activeAdminFlows.get(userId) || {};
            flow.slot = slot;
            activeAdminFlows.set(userId, flow);

            const userSelect = new UserSelectMenuBuilder()
                .setCustomId('adminmanage_create_players')
                .setPlaceholder('👥 Select players (1st selected = Host, Max 8)...')
                .setMinValues(1)
                .setMaxValues(8);

            await interaction.update({
                content: `📅 Date: **${flow.date}** | ➕ **New Table** (${slot})\n\nSelect the players for this table (the first user selected will be the host):`,
                components: [new ActionRowBuilder().addComponents(userSelect)]
            });
        }

        // --- ACTION SELECTED ON EXISTING TABLE ---
        else if (interaction.customId === 'adminmanage_select_action') {
            const action = interaction.values[0];
            const flow = activeAdminFlows.get(userId) || {};
            flow.action = action;
            activeAdminFlows.set(userId, flow);

            const slotLabel = flow.scheduleType === 'thursday' ? 'Thursday' : flow.slot;

            if (action === 'add_player') {
                const userSelect = new UserSelectMenuBuilder()
                    .setCustomId('adminmanage_add_user')
                    .setPlaceholder(`👤 Select member to add to ${slotLabel}...`)
                    .setMinValues(1)
                    .setMaxValues(1);

                return interaction.update({
                    content: `📅 Date: **${flow.date}** | 📌 **Table ${flow.tableNumber}** (${slotLabel})\n\nSelect a member to add:`,
                    components: [new ActionRowBuilder().addComponents(userSelect)]
                });
            }

            if (action === 'remove_player') {
                if (flow.scheduleType === 'event') {
                    const eventData = eventManager.getEventData(flow.date);
                    const t = eventData?.tables?.[flow.tableNumber];
                    const slotKey = flow.slot === 'Whole Day' ? (t?.am ? 'am' : 'pm') : flow.slot.toLowerCase();
                    const slotData = t?.[slotKey];
                    const players = slotData?.players || [];
                    const organizerId = slotData?.organizerId;

                    if (!players.length) {
                        return interaction.update({
                            content: `❌ No players on roster for Table ${flow.tableNumber} (${flow.slot}).`,
                            components: []
                        });
                    }

                    const playerMenu = new StringSelectMenuBuilder()
                        .setCustomId('adminmanage_remove_user')
                        .setPlaceholder('❌ Select player to remove...')
                        .addOptions(
                            players.map(p => new StringSelectMenuOptionBuilder()
                                .setLabel(p.name || p.id)
                                .setValue(p.id)
                                .setDescription(p.id === organizerId ? 'Table Organizer' : 'Player')
                            )
                        );

                    return interaction.update({
                        content: `📅 Date: **${flow.date}** | 📌 **Table ${flow.tableNumber}** (${flow.slot})\n\nSelect player to remove:`,
                        components: [new ActionRowBuilder().addComponents(playerMenu)]
                    });
                }

                // Thursday reservation stores playerNames as a comma-separated string
                const res = getThursdayReservation(flow.date, flow.tableNumber);
                const rosterNames = parsePlayerNames(res?.playerNames);

                if (!res || rosterNames.length === 0) {
                    return interaction.update({
                        content: `❌ No players found on roster for Thursday **Table ${flow.tableNumber}** on **${flow.date}**.`,
                        components: []
                    });
                }

                const playerMenu = new StringSelectMenuBuilder()
                    .setCustomId('adminmanage_remove_user')
                    .setPlaceholder('❌ Select player name to remove...')
                    .addOptions(
                        rosterNames.map(name => new StringSelectMenuOptionBuilder()
                            .setLabel(name)
                            .setValue(name)
                            .setDescription(name === res.username ? 'Table Host' : 'Player')
                        )
                    );

                return interaction.update({
                    content: `📅 Date: **${flow.date}** | 📌 **Table ${flow.tableNumber}** (Thursday)\n\nSelect player to remove:`,
                    components: [new ActionRowBuilder().addComponents(playerMenu)]
                });
            }

            if (action === 'edit_details') {
                if (flow.scheduleType === 'event') {
                    const eventData = eventManager.getEventData(flow.date);
                    const t = eventData?.tables?.[flow.tableNumber];
                    const slotKey = flow.slot === 'Whole Day' ? (t?.am ? 'am' : 'pm') : flow.slot.toLowerCase();
                    const slotData = t?.[slotKey];

                    const modal = new ModalBuilder()
                        .setCustomId('adminmanage_details_modal')
                        .setTitle(`Edit Table ${flow.tableNumber} (${flow.slot})`.slice(0, 45));

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

                // Thursday bookings only track gameName (no AM/PM or maxPlayers field in reservations.json)
                const res = getThursdayReservation(flow.date, flow.tableNumber);
                const modal = new ModalBuilder()
                    .setCustomId('adminmanage_details_modal')
                    .setTitle(`Edit Thursday Table ${flow.tableNumber}`.slice(0, 45));

                modal.addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('modal_game_name')
                            .setLabel('Game System / Title')
                            .setValue(res?.gameName || '')
                            .setRequired(true)
                            .setStyle(TextInputStyle.Short)
                    )
                );

                return interaction.showModal(modal);
            }
        }

        // --- REMOVE PLAYER EXECUTED ---
        else if (interaction.customId === 'adminmanage_remove_user') {
            const selectedValue = interaction.values[0];
            const flow = activeAdminFlows.get(userId);
            if (!flow) {
                return interaction.update({ content: '❌ Session expired. Please run `/adminmanage` again.', components: [] });
            }

            try {
                if (flow.scheduleType === 'event') {
                    const res = eventManager.adminRemovePlayer(flow.date, flow.tableNumber, flow.slot, selectedValue);
                    activeAdminFlows.delete(userId);

                    return interaction.update({
                        content: res?.freed
                            ? `✅ Removed <@${selectedValue}> from **Table ${flow.tableNumber}** (${flow.slot}). Roster was empty, so that slot is now free!`
                            : `✅ Removed <@${selectedValue}> from **Table ${flow.tableNumber}** (${flow.slot}) roster on **${flow.date}**.`,
                        components: []
                    });
                }

                // Thursday roster removal by player name
                const res = getThursdayReservation(flow.date, flow.tableNumber);
                if (!res) {
                    activeAdminFlows.delete(userId);
                    return interaction.update({
                        content: `❌ Thursday **Table ${flow.tableNumber}** on **${flow.date}** was not found.`,
                        components: []
                    });
                }

                const remainingNames = parsePlayerNames(res.playerNames).filter(
                    name => name.toLowerCase() !== selectedValue.toLowerCase()
                );

                activeAdminFlows.delete(userId);

                if (remainingNames.length === 0) {
                    tableManager.removeReservationByTableAndDate(flow.tableNumber, flow.date, res.session || 'Evening 18:00-22:00');
                    return interaction.update({
                        content: `✅ Removed **${selectedValue}** from Thursday **Table ${flow.tableNumber}** on **${flow.date}**. No players remained, so the table has been freed.`,
                        components: []
                    });
                }

                res.playerNames = remainingNames.join(', ');
                tableManager.saveReservations();

                return interaction.update({
                    content: `✅ Removed **${selectedValue}** from Thursday **Table ${flow.tableNumber}** on **${flow.date}**.\n👥 **Remaining roster:** ${res.playerNames}`,
                    components: []
                });
            } catch (err) {
                await interaction.update({ content: `❌ ${err.message}`, components: [] });
            }
        }
    },

    async handleUserSelect(interaction) {
        const userId = interaction.user.id;
        const flow = activeAdminFlows.get(userId);
        if (!flow) {
            return interaction.update({ content: '❌ Session expired. Please run `/adminmanage` again.', components: [] });
        }

        if (interaction.customId === 'adminmanage_create_players') {
            const roster = [];
            for (const [uid, user] of interaction.users) {
                const member = interaction.guild ? await interaction.guild.members.fetch(uid).catch(() => null) : null;
                const displayName = member ? member.displayName : user.username;
                roster.push({ id: uid, name: displayName });
            }

            flow.roster = roster;
            activeAdminFlows.set(userId, flow);

            if (flow.scheduleType === 'thursday') {
                const modal = new ModalBuilder()
                    .setCustomId('adminmanage_create_modal')
                    .setTitle('New Thursday Table');

                modal.addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('modal_game_name')
                            .setLabel('Game System / Title')
                            .setPlaceholder('e.g. Warhammer 40k, BattleTech, Star Wars Shatterpoint')
                            .setRequired(true)
                            .setStyle(TextInputStyle.Short)
                    )
                );

                return interaction.showModal(modal);
            }

            const modal = new ModalBuilder()
                .setCustomId('adminmanage_create_modal')
                .setTitle(`New Event Table (${flow.slot})`.slice(0, 45));

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
        const member = interaction.guild ? await interaction.guild.members.fetch(selectedUser.id).catch(() => null) : null;
        const nickname = member ? member.displayName : selectedUser.username;

        try {
            if (flow.scheduleType === 'event') {
                eventManager.adminAddPlayer(flow.date, flow.tableNumber, flow.slot, selectedUser.id, nickname);
                activeAdminFlows.delete(userId);

                return interaction.update({
                    content: `✅ Added <@${selectedUser.id}> (${nickname}) to **Table ${flow.tableNumber}** (${flow.slot}) on **${flow.date}**!`,
                    components: []
                });
            }

            const res = getThursdayReservation(flow.date, flow.tableNumber);
            if (!res) {
                activeAdminFlows.delete(userId);
                return interaction.update({
                    content: `❌ Thursday **Table ${flow.tableNumber}** on **${flow.date}** was not found.`,
                    components: []
                });
            }

            const currentNames = parsePlayerNames(res.playerNames);
            if (!currentNames.some(name => name.toLowerCase() === nickname.toLowerCase())) {
                currentNames.push(nickname);
                res.playerNames = currentNames.join(', ');
                tableManager.saveReservations();
            }

            activeAdminFlows.delete(userId);

            return interaction.update({
                content: `✅ Added <@${selectedUser.id}> (${nickname}) to Thursday **Table ${flow.tableNumber}** on **${flow.date}**!\n👥 **Roster:** ${res.playerNames}`,
                components: []
            });
        } catch (err) {
            await interaction.update({ content: `❌ ${err.message}`, components: [] });
        }
    },

    async handleModalSubmit(interaction) {
        const userId = interaction.user.id;
        const flow = activeAdminFlows.get(userId);
        if (!flow) {
            return interaction.reply({ content: '❌ Session expired. Please run `/adminmanage` again.', ephemeral: true });
        }

        if (interaction.customId === 'adminmanage_create_modal') {
            const gameName = interaction.fields.getTextInputValue('modal_game_name').trim();
            const roster = flow.roster || [];
            const primaryHost = roster[0] || { id: interaction.user.id, name: interaction.user.username };
            const mentions = roster.map(p => `<@${p.id}>`).join(', ');

            try {
                if (flow.scheduleType === 'thursday') {
                    const playerNamesString = roster.map(p => p.name).join(', ') || primaryHost.name;
                    const res = tableManager.addReservation(
                        primaryHost.id,
                        primaryHost.name,
                        playerNamesString,
                        gameName,
                        flow.date,
                        'Evening 18:00-22:00'
                    );
                    const tableNum = (typeof res === 'object' && res !== null) ? (res.tableNumber || res.table || res) : res;
                    activeAdminFlows.delete(userId);

                    return interaction.reply({
                        content: `🎉 **Admin Thursday Table Created!**\nReserved **Table ${tableNum}** on **${flow.date}** for ${mentions} playing **${gameName}** (Host: **${primaryHost.name}**).`,
                        ephemeral: true
                    });
                }

                const maxPlayers = parseInt(interaction.fields.getTextInputValue('modal_max_players').trim(), 10) || 8;
                const tableNum = eventManager.createBooking(
                    flow.date,
                    flow.slot,
                    primaryHost.id,
                    primaryHost.name,
                    gameName,
                    maxPlayers,
                    roster
                );
                activeAdminFlows.delete(userId);

                return interaction.reply({
                    content: `🎉 **Admin Event Table Created!**\nReserved **Table ${tableNum}** (${flow.slot}) on **${flow.date}** for ${mentions} playing **${gameName}** (Host: **${primaryHost.name}**, Max Capacity: ${maxPlayers}).`,
                    ephemeral: true
                });
            } catch (err) {
                return interaction.reply({ content: `❌ ${err.message}`, ephemeral: true });
            }
        }

        if (interaction.customId !== 'adminmanage_details_modal') return;

        const gameName = interaction.fields.getTextInputValue('modal_game_name').trim();

        try {
            if (flow.scheduleType === 'thursday') {
                const res = getThursdayReservation(flow.date, flow.tableNumber);
                if (!res) {
                    activeAdminFlows.delete(userId);
                    return interaction.reply({
                        content: `❌ Thursday **Table ${flow.tableNumber}** on **${flow.date}** was not found.`,
                        ephemeral: true
                    });
                }

                res.gameName = gameName;
                tableManager.saveReservations();
                activeAdminFlows.delete(userId);

                return interaction.reply({
                    content: `✅ Updated Thursday **Table ${flow.tableNumber}** on **${flow.date}**!\n🎮 **Game:** ${gameName}`,
                    ephemeral: true
                });
            }

            const maxPlayers = parseInt(interaction.fields.getTextInputValue('modal_max_players').trim(), 10) || 8;
            eventManager.adminUpdateDetails(flow.date, flow.tableNumber, flow.slot, gameName, maxPlayers);
            activeAdminFlows.delete(userId);

            return interaction.reply({
                content: `✅ Updated **Table ${flow.tableNumber}** (${flow.slot}) on **${flow.date}**!\n🎮 **Game:** ${gameName}\n👥 **Max Capacity:** ${maxPlayers}`,
                ephemeral: true
            });
        } catch (err) {
            return interaction.reply({ content: `❌ ${err.message}`, ephemeral: true });
        }
    }
};
