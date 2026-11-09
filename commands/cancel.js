const { 
    SlashCommandBuilder, 
    ActionRowBuilder, 
    StringSelectMenuBuilder, 
    StringSelectMenuOptionBuilder 
} = require('discord.js');
const tableManager = require('../utils/tableManager');
const eventManager = require('../utils/eventManager');
const fs = require('fs');
const path = require('path');

const activeCancelFlows = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('cancel')
        .setDescription('Cancel your table reservation or remove yourself from a table roster'),

    async execute(interaction) {
        const typeMenu = new StringSelectMenuBuilder()
            .setCustomId('cancel_select_type')
            .setPlaceholder('📂 Select reservation category...')
            .addOptions([
                { label: 'Thursday Club Night', value: 'thursday', description: 'Cancel or leave a standard Thursday night table', emoji: '🍺' },
                { label: 'Special Club Event', value: 'event', description: 'Cancel or leave a weekend event table session', emoji: '📅' }
            ]);

        await interaction.reply({
            content: '🗑️ **Table Cancellation**\nStep 1: Choose the category of night you want to cancel or leave:',
            components: [new ActionRowBuilder().addComponents(typeMenu)],
            ephemeral: true
        });
    },

    async handleSelectMenu(interaction) {
        // --- STEP 1: Select Type (Thursday vs Event) ---
        if (interaction.customId === 'cancel_select_type') {
            await interaction.deferUpdate();
            const type = interaction.values[0];
            activeCancelFlows.set(interaction.user.id, { type });

            if (type === 'thursday') {
                const groupedRes = tableManager.getReservationsGroupedByDate();
                const userResOptions = [];
                const userNick = interaction.guild 
                    ? (await interaction.guild.members.fetch(interaction.user.id)).displayName 
                    : interaction.user.username;

                for (const [dateStr, tables] of Object.entries(groupedRes)) {
                    for (const [tableNum, res] of Object.entries(tables)) {
                        if (!res) continue;
                        const isHost = res.userId === interaction.user.id;
                        const isPlayer = res.playerNames && res.playerNames.toLowerCase().includes(userNick.toLowerCase());

                        if (isHost || isPlayer) {
                            userResOptions.push({
                                label: `Table ${tableNum} (${dateStr}): ${res.gameName}`,
                                description: `Host: ${res.username} | Roster: ${res.playerNames}`,
                                value: `${dateStr}|${tableNum}`
                            });
                        }
                    }
                }

                if (userResOptions.length === 0) {
                    return interaction.editReply({
                        content: '❌ No active Thursday night table reservations found for your user.',
                        components: []
                    });
                }

                const thursdayMenu = new StringSelectMenuBuilder()
                    .setCustomId('cancel_thursday_select')
                    .setPlaceholder('📌 Select Thursday table to manage...')
                    .addOptions(userResOptions.map(opt => new StringSelectMenuOptionBuilder(opt)));

                await interaction.editReply({
                    content: '🍺 **Thursday Cancellations**\nSelect table booking:',
                    components: [new ActionRowBuilder().addComponents(thursdayMenu)]
                });
            } else if (type === 'event') {
                const events = eventManager.getUpcomingEvents();
                if (events.length === 0) {
                    return interaction.editReply({ content: '❌ No upcoming special events scheduled.', components: [] });
                }

                const eventMenu = new StringSelectMenuBuilder()
                    .setCustomId('cancel_event_date')
                    .setPlaceholder('📅 Select event date...')
                    .addOptions(events.map(e => new StringSelectMenuOptionBuilder().setLabel(e.label).setValue(e.value)));

                await interaction.editReply({
                    content: '📅 **Special Event Cancellations**\nSelect event date:',
                    components: [new ActionRowBuilder().addComponents(eventMenu)]
                });
            }
        }

        // --- BRANCH A: Thursday Table Selected -> Choose Action ---
        else if (interaction.customId === 'cancel_thursday_select') {
            await interaction.deferUpdate();
            const [dateStr, tableNumStr] = interaction.values[0].split('|');
            const flow = activeCancelFlows.get(interaction.user.id) || {};
            flow.date = dateStr;
            flow.tableNumber = parseInt(tableNumStr);
            activeCancelFlows.set(interaction.user.id, flow);

            const actionMenu = new StringSelectMenuBuilder()
                .setCustomId('cancel_thursday_action')
                .setPlaceholder('⚙️ Choose cancellation action...')
                .addOptions([
                    { label: 'Remove Me from Roster', value: 'remove_self', emoji: '👤', description: 'Remove your name from this table roster' },
                    { label: 'Cancel Entire Table Slot', value: 'cancel_all', emoji: '🗑️', description: `Completely free Table ${flow.tableNumber}` }
                ]);

            await interaction.editReply({
                content: `🍺 **Thursday Table ${flow.tableNumber}** (${flow.date})\nSelect action:`,
                components: [new ActionRowBuilder().addComponents(actionMenu)]
            });
        }

        // --- BRANCH A2: Execute Thursday Cancellation ---
        else if (interaction.customId === 'cancel_thursday_action') {
            const action = interaction.values[0];
            const flow = activeCancelFlows.get(interaction.user.id);
            if (!flow) {
                return interaction.update({ content: '❌ Session expired. Please run `/cancel` again.', components: [] });
            }

            const userNick = interaction.guild 
                ? (await interaction.guild.members.fetch(interaction.user.id)).displayName 
                : interaction.user.username;

            const groupedRes = tableManager.getReservationsGroupedByDate();
            const res = groupedRes[flow.date] ? groupedRes[flow.date][flow.tableNumber] : null;

            if (!res) {
                return interaction.update({ content: '❌ Reservation no longer exists.', components: [] });
            }

            if (action === 'cancel_all') {
                tableManager.removeReservationByTableAndDate(flow.tableNumber, flow.date, res.session || 'Evening 18:00-22:00');
                activeCancelFlows.delete(interaction.user.id);

                await interaction.update({
                    content: `🗑️ **Table ${flow.tableNumber}** on **${flow.date}** has been completely cancelled.`,
                    components: []
                });
            } else if (action === 'remove_self') {
                const playerArray = res.playerNames.split(',').map(p => p.trim());
                const updatedArray = playerArray.filter(p => p.toLowerCase() !== userNick.toLowerCase() && p.toLowerCase() !== interaction.user.username.toLowerCase());

                if (updatedArray.length === 0) {
                    tableManager.removeReservationByTableAndDate(flow.tableNumber, flow.date, res.session || 'Evening 18:00-22:00');
                    activeCancelFlows.delete(interaction.user.id);

                    await interaction.update({
                        content: `✅ You were removed from **Table ${flow.tableNumber}**. Roster was empty, so the table has been freed!`,
                        components: []
                    });
                } else {
                    const newPlayerNames = updatedArray.join(', ');
                    tableManager.updateTablePlayers(flow.tableNumber, flow.date, res.session || 'Evening 18:00-22:00', newPlayerNames);
                    activeCancelFlows.delete(interaction.user.id);

                    await interaction.update({
                        content: `✅ Removed you from **Table ${flow.tableNumber}** roster on **${flow.date}**. Updated roster: **${newPlayerNames}**.`,
                        components: []
                    });
                }
            }
        }

        // --- BRANCH B: Event Date Selected -> Pick Specific Slot/Table ---
        else if (interaction.customId === 'cancel_event_date') {
            await interaction.deferUpdate();
            const dateStr = interaction.values[0];
            const flow = activeCancelFlows.get(interaction.user.id) || {};
            flow.date = dateStr;
            activeCancelFlows.set(interaction.user.id, flow);

            const eventData = eventManager.getEventData(dateStr);
            const activeSlots = [];

            for (let i = 1; i <= eventManager.MAX_TABLES; i++) {
                const t = eventData.tables[i];
                if (!t) continue;

                if (t.am && t.pm && t.am.organizerId === t.pm.organizerId && t.am.gameName === t.pm.gameName) {
                    const isMember = t.am.players.some(p => p.id === interaction.user.id);
                    activeSlots.push({
                        label: `Table ${i}: ${t.am.gameName} (Whole Day)${isMember ? ' [Your Table]' : ''}`,
                        description: `Host: ${t.am.organizerName} | Roster: ${t.am.players.length}/${t.am.maxPlayers}`,
                        value: `${i}|Whole Day`
                    });
                } else {
                    if (t.am) {
                        const isMember = t.am.players.some(p => p.id === interaction.user.id);
                        activeSlots.push({
                            label: `Table ${i} AM: ${t.am.gameName}${isMember ? ' [Your Table]' : ''}`,
                            description: `Host: ${t.am.organizerName} | Roster: ${t.am.players.length}/${t.am.maxPlayers}`,
                            value: `${i}|AM`
                        });
                    }
                    if (t.pm) {
                        const isMember = t.pm.players.some(p => p.id === interaction.user.id);
                        activeSlots.push({
                            label: `Table ${i} PM: ${t.pm.gameName}${isMember ? ' [Your Table]' : ''}`,
                            description: `Host: ${t.pm.organizerName} | Roster: ${t.pm.players.length}/${t.pm.maxPlayers}`,
                            value: `${i}|PM`
                        });
                    }
                }
            }

            if (activeSlots.length === 0) {
                return interaction.editReply({
                    content: `❌ No active table bookings found for **${dateStr}**.`,
                    components: []
                });
            }

            const tableMenu = new StringSelectMenuBuilder()
                .setCustomId('cancel_event_table')
                .setPlaceholder('📌 Select session slot to manage...')
                .addOptions(activeSlots.map(opt => new StringSelectMenuOptionBuilder(opt)));

            await interaction.editReply({
                content: `📅 **Event Cancellations** (${dateStr})\nSelect the specific table session slot to manage:`,
                components: [new ActionRowBuilder().addComponents(tableMenu)]
            });
        }

        // --- BRANCH B2: Select Action (Remove Self vs Cancel Whole Slot) ---
        else if (interaction.customId === 'cancel_event_table') {
            await interaction.deferUpdate();
            const [tableNumStr, slot] = interaction.values[0].split('|');
            const flow = activeCancelFlows.get(interaction.user.id) || {};
            flow.tableNumber = parseInt(tableNumStr);
            flow.slot = slot;
            activeCancelFlows.set(interaction.user.id, flow);

            const actionMenu = new StringSelectMenuBuilder()
                .setCustomId('cancel_event_action')
                .setPlaceholder('⚠️ Choose how you want to cancel...')
                .addOptions([
                    { 
                        label: 'Remove Me from Roster', 
                        value: 'remove_self', 
                        emoji: '👤', 
                        description: 'Leave roster. If host, host role passes to next player.' 
                    },
                    { 
                        label: 'Cancel Entire Table Slot', 
                        value: 'cancel_all', 
                        emoji: '🗑️', 
                        description: `Completely free Table ${flow.tableNumber} (${slot}) slot` 
                    }
                ]);

            await interaction.editReply({
                content: `📌 **Table ${flow.tableNumber}** (${flow.slot}) on **${flow.date}**\nSelect action:`,
                components: [new ActionRowBuilder().addComponents(actionMenu)]
            });
        }

        // --- BRANCH B3: Execute Event Cancellation ---
        else if (interaction.customId === 'cancel_event_action') {
            const action = interaction.values[0];
            const flow = activeCancelFlows.get(interaction.user.id);

            if (!flow) {
                return interaction.update({ content: '❌ Session expired. Please run `/cancel` again.', components: [] });
            }

            try {
                if (action === 'remove_self') {
                    const res = eventManager.adminRemovePlayer(flow.date, flow.tableNumber, flow.slot, interaction.user.id);
                    activeCancelFlows.delete(interaction.user.id);

                    if (res.freed) {
                        await interaction.update({
                            content: `✅ You were removed from **Table ${flow.tableNumber}** (${flow.slot}). Roster was empty, so the table slot is now free!`,
                            components: []
                        });
                    } else {
                        await interaction.update({
                            content: `✅ You left **Table ${flow.tableNumber}** (${flow.slot}) roster for **${flow.date}**. Current host: **${res.slotData.organizerName}**.`,
                            components: []
                        });
                    }
                } else if (action === 'cancel_all') {
                    const eventData = eventManager.getEventData(flow.date);
                    const t = eventData.tables[flow.tableNumber];
                    const slotKey = flow.slot === 'Whole Day' ? (t.am ? 'am' : 'pm') : flow.slot.toLowerCase();

                    if (flow.slot === 'Whole Day') {
                        t.am = null;
                        t.pm = null;
                    } else {
                        t[slotKey] = null;
                    }

                    const filePath = path.join(__dirname, '../data/event-bookings.json');
                    const fullData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                    fullData[flow.date] = eventData;
                    fs.writeFileSync(filePath, JSON.stringify(fullData, null, 2));

                    activeCancelFlows.delete(interaction.user.id);

                    await interaction.update({
                        content: `🗑️ **Table ${flow.tableNumber}** (${flow.slot}) on **${flow.date}** has been completely freed.`,
                        components: []
                    });
                }
            } catch (err) {
                await interaction.update({ content: `❌ ${err.message}`, components: [] });
            }
        }
    }
};
