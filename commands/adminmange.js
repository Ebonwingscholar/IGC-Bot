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
        .setDescription('Admin: Edit table bookings, add/remove players, or change game details')
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
            content: '🛠️ **Admin Table Manager**\nStep 1 of 4: Select the event date to manage:',
            components: [new ActionRowBuilder().addComponents(dateMenu)],
            ephemeral: true
        });
    },

    async handleSelectMenu(interaction) {
        // Step 1: Date Selected -> Pick Table & Specific Slot (AM, PM, or Whole Day)
        if (interaction.customId === 'adminmanage_select_date') {
            const dateStr = interaction.values[0];
            const eventData = eventManager.getEventData(dateStr);
            const bookedOptions = [];

            for (let i = 1; i <= eventManager.MAX_TABLES; i++) {
                const t = eventData.tables[i];
                if (!t) continue;

                // Check if it's a unified Whole Day booking
                if (t.am && t.pm && t.am.organizerId === t.pm.organizerId && t.am.gameName === t.pm.gameName) {
                    bookedOptions.push({
                        label: `Table ${i}: ${t.am.gameName} (Whole Day)`,
                        description: `Host: ${t.am.organizerName} | Players: ${t.am.players.length}/${t.am.maxPlayers}`,
                        value: `${i}|Whole Day`
                    });
                } else {
                    if (t.am) {
                        bookedOptions.push({
                            label: `Table ${i} AM: ${t.am.gameName}`,
                            description: `Host: ${t.am.organizerName} | Players: ${t.am.players.length}/${t.am.maxPlayers}`,
                            value: `${i}|AM`
                        });
                    }
                    if (t.pm) {
                        bookedOptions.push({
                            label: `Table ${i} PM: ${t.pm.gameName}`,
                            description: `Host: ${t.pm.organizerName} | Players: ${t.pm.players.length}/${t.pm.maxPlayers}`,
                            value: `${i}|PM`
                        });
                    }
                }
            }

            if (bookedOptions.length === 0) {
                return interaction.update({
                    content: `❌ No active table bookings found for **${dateStr}**.`,
                    components: []
                });
            }

            activeAdminFlows.set(interaction.user.id, { date: dateStr });

            const tableMenu = new StringSelectMenuBuilder()
                .setCustomId('adminmanage_select_table')
                .setPlaceholder('📌 Select specific table slot to manage...')
                .addOptions(bookedOptions.map(opt => new StringSelectMenuOptionBuilder(opt)));

            await interaction.update({
                content: `📅 Date: **${dateStr}**\n\nStep 2 of 4: Select the exact table session to edit:`,
                components: [new ActionRowBuilder().addComponents(tableMenu)]
            });
        }
        // Step 2: Table Slot Selected -> Choose Action
        else if (interaction.customId === 'adminmanage_select_table') {
            const [tableNumStr, slot] = interaction.values[0].split('|');
            const tableNumber = parseInt(tableNumStr);
            const flow = activeAdminFlows.get(interaction.user.id) || {};
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
                content: `📅 Date: **${flow.date}** | 📌 **Table ${tableNumber}** (${slot})\n\nStep 3 of 4: What action do you want to take?`,
                components: [new ActionRowBuilder().addComponents(actionMenu)]
            });
        }
        // Step 3: Action Selected
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
        if (interaction.customId !== 'adminmanage_add_user') return;

        const flow = activeAdminFlows.get(interaction.user.id);
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
        if (interaction.customId !== 'adminmanage_details_modal') return;

        const flow = activeAdminFlows.get(interaction.user.id);
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
