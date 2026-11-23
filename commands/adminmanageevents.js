const { 
    SlashCommandBuilder, 
    PermissionFlagsBits,
    ActionRowBuilder, 
    StringSelectMenuBuilder, 
    StringSelectMenuOptionBuilder,
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle
} = require('discord.js');
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../data/event-bookings.json');
const activeEventAdminFlows = new Map();

function getData() {
    if (!fs.existsSync(filePath)) return {};
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return {};
    }
}

function saveData(data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function isValidCalendarDate(dateStr) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

function buildEventOptions(data) {
    return Object.keys(data)
        .sort()
        .map(dateStr => {
            const ev = data[dateStr] || {};
            const name = ev.eventName || 'Unnamed Event';
            let bookedCount = 0;
            if (ev.tables) {
                for (const t of Object.values(ev.tables)) {
                    if (t && (t.am || t.pm)) bookedCount++;
                }
            }
            return new StringSelectMenuOptionBuilder()
                .setLabel(`${dateStr} — ${name}`.slice(0, 100))
                .setDescription(`${bookedCount} table(s) currently booked`)
                .setValue(dateStr);
        });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('adminmanageevents')
        .setDescription('Admin: Create, edit, or cancel special club events')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        const actionMenu = new StringSelectMenuBuilder()
            .setCustomId('adminmanageevents_action')
            .setPlaceholder('📅 Choose an event management action...')
            .addOptions([
                {
                    label: 'Create New Event',
                    value: 'create',
                    description: 'Schedule a new named club event on a specific date',
                    emoji: '➕'
                },
                {
                    label: 'Edit Existing Event (Date / Name)',
                    value: 'edit',
                    description: 'Change an event date or title while keeping existing table bookings',
                    emoji: '✏️'
                },
                {
                    label: 'Cancel / Remove Event',
                    value: 'stop',
                    description: 'Cancel an event and clear all of its table bookings',
                    emoji: '🗑️'
                }
            ]);

        await interaction.reply({
            content: '📅 **Admin Event Manager**\nWhat would you like to do?',
            components: [new ActionRowBuilder().addComponents(actionMenu)],
            ephemeral: true
        });
    },

    async handleSelectMenu(interaction) {
        // --- STEP 1: Main Action Selected ---
        if (interaction.customId === 'adminmanageevents_action') {
            const action = interaction.values[0];

            if (action === 'create') {
                const modal = new ModalBuilder()
                    .setCustomId('adminmanageevents_create_modal')
                    .setTitle('Create Club Event');

                modal.addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('modal_event_date')
                            .setLabel('Event Date (YYYY-MM-DD)')
                            .setPlaceholder('e.g. 2026-12-12')
                            .setRequired(true)
                            .setStyle(TextInputStyle.Short)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('modal_event_name')
                            .setLabel('Event Name')
                            .setPlaceholder('e.g. Winter Wargaming All-Dayer')
                            .setRequired(true)
                            .setStyle(TextInputStyle.Short)
                    )
                );

                return interaction.showModal(modal);
            }

            const data = getData();
            const eventOptions = buildEventOptions(data);

            if (eventOptions.length === 0) {
                return interaction.update({
                    content: '❌ There are currently no scheduled events in `event-bookings.json`.',
                    components: []
                });
            }

            if (action === 'edit') {
                const editMenu = new StringSelectMenuBuilder()
                    .setCustomId('adminmanageevents_edit_select')
                    .setPlaceholder('✏️ Select the event you want to edit...')
                    .addOptions(eventOptions.slice(0, 25));

                return interaction.update({
                    content: '✏️ **Edit Club Event**\nSelect the event you want to modify (existing table bookings will be preserved):',
                    components: [new ActionRowBuilder().addComponents(editMenu)]
                });
            }

            if (action === 'stop') {
                const stopMenu = new StringSelectMenuBuilder()
                    .setCustomId('adminmanageevents_stop_select')
                    .setPlaceholder('🗑️ Select the event to cancel and clear...')
                    .addOptions(eventOptions.slice(0, 25));

                return interaction.update({
                    content: '🗑️ **Cancel / Remove Event**\nSelect the event you want to remove:',
                    components: [new ActionRowBuilder().addComponents(stopMenu)]
                });
            }
        }

        // --- STEP 2A: Event Selected for Editing -> Open Pre-filled Modal ---
        else if (interaction.customId === 'adminmanageevents_edit_select') {
            const oldDateStr = interaction.values[0];
            const data = getData();
            const currentEvent = data[oldDateStr];

            if (!currentEvent) {
                return interaction.update({
                    content: `❌ Event on **${oldDateStr}** could not be found.`,
                    components: []
                });
            }

            activeEventAdminFlows.set(interaction.user.id, { oldDate: oldDateStr });

            const modal = new ModalBuilder()
                .setCustomId('adminmanageevents_edit_modal')
                .setTitle('Edit Club Event');

            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('modal_event_date')
                        .setLabel('Event Date (YYYY-MM-DD)')
                        .setValue(oldDateStr)
                        .setRequired(true)
                        .setStyle(TextInputStyle.Short)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('modal_event_name')
                        .setLabel('Event Name')
                        .setValue(currentEvent.eventName || '')
                        .setRequired(true)
                        .setStyle(TextInputStyle.Short)
                )
            );

            return interaction.showModal(modal);
        }

        // --- STEP 2B: Event Selected for Removal -> Confirmation Step ---
        else if (interaction.customId === 'adminmanageevents_stop_select') {
            const dateStr = interaction.values[0];
            const data = getData();
            const ev = data[dateStr];

            if (!ev) {
                return interaction.update({
                    content: `⚠️ No active event found for **${dateStr}**.`,
                    components: []
                });
            }

            activeEventAdminFlows.set(interaction.user.id, { targetDate: dateStr });

            const confirmMenu = new StringSelectMenuBuilder()
                .setCustomId('adminmanageevents_stop_confirm')
                .setPlaceholder('⚠️ Confirm deletion...')
                .addOptions([
                    {
                        label: `Yes, delete "${ev.eventName || dateStr}"`,
                        value: 'confirm_delete',
                        description: 'Permanently removes this event and all booked tables',
                        emoji: '⚠️'
                    },
                    {
                        label: 'No, keep this event',
                        value: 'cancel_delete',
                        description: 'Abort and leave all bookings untouched',
                        emoji: '↩️'
                    }
                ]);

            return interaction.update({
                content: `⚠️ **Are you sure?**\nYou are about to delete **${ev.eventName || 'Unnamed Event'}** on **${dateStr}** and wipe all table bookings on that date.`,
                components: [new ActionRowBuilder().addComponents(confirmMenu)]
            });
        }

        // --- STEP 3B: Confirm or Abort Event Removal ---
        else if (interaction.customId === 'adminmanageevents_stop_confirm') {
            const choice = interaction.values[0];
            const flow = activeEventAdminFlows.get(interaction.user.id);
            activeEventAdminFlows.delete(interaction.user.id);

            if (choice !== 'confirm_delete' || !flow || !flow.targetDate) {
                return interaction.update({
                    content: '↩️ Cancelled — no events or bookings were removed.',
                    components: []
                });
            }

            try {
                const data = getData();
                const removedName = data[flow.targetDate]?.eventName || flow.targetDate;

                if (!data[flow.targetDate]) {
                    return interaction.update({
                        content: `⚠️ Event on **${flow.targetDate}** was already removed.`,
                        components: []
                    });
                }

                delete data[flow.targetDate];
                saveData(data);

                return interaction.update({
                    content: `✅ Cancelled and removed **"${removedName}"** (**${flow.targetDate}**). All table bookings for that date have been cleared.`,
                    components: []
                });
            } catch (err) {
                console.error('Error clearing event date:', err);
                return interaction.update({
                    content: `❌ Error clearing event date: ${err.message}`,
                    components: []
                });
            }
        }
    },

    async handleModalSubmit(interaction) {
        // --- CREATE EVENT MODAL SUBMIT ---
        if (interaction.customId === 'adminmanageevents_create_modal') {
            const dateStr = interaction.fields.getTextInputValue('modal_event_date').trim();
            const eventName = interaction.fields.getTextInputValue('modal_event_name').trim();

            if (!isValidCalendarDate(dateStr)) {
                return interaction.reply({
                    content: '❌ Invalid date. Please enter a real calendar date in `YYYY-MM-DD` format (e.g. `2026-12-12`).',
                    ephemeral: true
                });
            }

            const data = getData();

            if (data[dateStr]) {
                return interaction.reply({
                    content: `⚠️ An event (**"${data[dateStr].eventName}"**) already exists on **${dateStr}**. Use **Edit Existing Event** if you want to rename or move it.`,
                    ephemeral: true
                });
            }

            data[dateStr] = { eventName: eventName, tables: {} };
            for (let i = 1; i <= 12; i++) {
                data[dateStr].tables[i] = { am: null, pm: null };
            }

            saveData(data);

            return interaction.reply({
                content: `✅ Created event **"${eventName}"** for **${dateStr}**!\nMembers can now use \`/book\` to reserve tables.`,
                ephemeral: true
            });
        }

        // --- EDIT EVENT MODAL SUBMIT ---
        if (interaction.customId === 'adminmanageevents_edit_modal') {
            const flow = activeEventAdminFlows.get(interaction.user.id);
            activeEventAdminFlows.delete(interaction.user.id);

            if (!flow || !flow.oldDate) {
                return interaction.reply({
                    content: '❌ Session expired. Please run `/adminmanageevents` again.',
                    ephemeral: true
                });
            }

            const newDateStr = interaction.fields.getTextInputValue('modal_event_date').trim();
            const newEventName = interaction.fields.getTextInputValue('modal_event_name').trim();

            if (!isValidCalendarDate(newDateStr)) {
                return interaction.reply({
                    content: '❌ Invalid date. Please enter a real calendar date in `YYYY-MM-DD` format (e.g. `2026-12-12`).',
                    ephemeral: true
                });
            }

            const data = getData();
            const existingEvent = data[flow.oldDate];

            if (!existingEvent) {
                return interaction.reply({
                    content: `❌ Could not find the original event on **${flow.oldDate}**.`,
                    ephemeral: true
                });
            }

            // Prevent accidentally overwriting a different event if the date changed
            if (newDateStr !== flow.oldDate && data[newDateStr]) {
                return interaction.reply({
                    content: `⚠️ Another event (**"${data[newDateStr].eventName}"**) is already scheduled on **${newDateStr}**. Choose a different date or remove that event first.`,
                    ephemeral: true
                });
            }

            // Preserve all existing table bookings while updating name & date
            existingEvent.eventName = newEventName;

            if (newDateStr !== flow.oldDate) {
                data[newDateStr] = existingEvent;
                delete data[flow.oldDate];
            }

            saveData(data);

            const dateChangeMsg = newDateStr !== flow.oldDate
                ? `\n📅 **Date moved:** ${flow.oldDate} ➔ **${newDateStr}** (all existing table bookings transferred)`
                : `\n📅 **Date:** ${newDateStr}`;

            return interaction.reply({
                content: `✅ Event updated successfully!\n🏷️ **Name:** ${newEventName}${dateChangeMsg}`,
                ephemeral: true
            });
        }
    }
};
