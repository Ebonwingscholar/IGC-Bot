const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const eventManager = require('../utils/eventManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('viewevents')
        .setDescription('View table schedules and player rosters for upcoming club events'),

    async execute(interaction) {
        const events = eventManager.getUpcomingEvents();

        if (events.length === 0) {
            return interaction.reply({
                content: '❌ There are currently no upcoming club events scheduled to view.',
                ephemeral: true
            });
        }

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('view_event_date')
            .setPlaceholder('📅 Select an event to view schedule...')
            .addOptions(
                events.map(e => new StringSelectMenuOptionBuilder()
                    .setLabel(e.label)
                    .setValue(e.value)
                )
            );

        await interaction.reply({
            content: '📊 **Inverurie Gaming Club - Event Schedules**\nSelect an upcoming event to view table bookings and player rosters:',
            components: [new ActionRowBuilder().addComponents(selectMenu)],
            ephemeral: true
        });
    },

    async handleSelectMenu(interaction) {
        if (interaction.customId !== 'view_event_date') return;

        const dateStr = interaction.values[0];
        const eventData = eventManager.getEventData(dateStr);
        const tables = eventData.tables;
        const eventTitle = eventData.eventName ? `"${eventData.eventName}"` : 'Club Event';

        let scheduleText = `🎲 **Event Table Schedule — ${eventTitle} (${dateStr})**\n\n`;
        let activeCount = 0;

        for (let i = 1; i <= eventManager.MAX_TABLES; i++) {
            const t = tables[i];
            if (!t.am && !t.pm) continue;

            activeCount++;
            scheduleText += `📌 **Table ${i}**\n`;

            // Check if both slots are booked by the same organizer/game (Whole Day)
            if (t.am && t.pm && t.am.organizerId === t.pm.organizerId && t.am.gameName === t.pm.gameName) {
                const pList = t.am.players.map(p => p.name).join(', ');
                scheduleText += `• 🟢 **Whole Day:** ${t.am.gameName}\n  Players (${t.am.players.length}/${t.am.maxPlayers}): ${pList}\n`;
            } else {
                if (t.am) {
                    const pList = t.am.players.map(p => p.name).join(', ');
                    scheduleText += `• 🌅 **AM (09:00-13:00):** ${t.am.gameName}\n  Players (${t.am.players.length}/${t.am.maxPlayers}): ${pList}\n`;
                } else {
                    scheduleText += `• 🌅 **AM:** *AVAILABLE*\n`;
                }

                if (t.pm) {
                    const pList = t.pm.players.map(p => p.name).join(', ');
                    scheduleText += `• 🌇 **PM (13:30-17:30):** ${t.pm.gameName}\n  Players (${t.pm.players.length}/${t.pm.maxPlayers}): ${pList}\n`;
                } else {
                    scheduleText += `• 🌇 **PM:** *AVAILABLE*\n`;
                }
            }
            scheduleText += `--------------------------------------------------\n`;
        }

        if (activeCount === 0) {
            scheduleText = `📅 **Event Table Schedule — ${eventTitle} (${dateStr})**\n\nNo tables have been booked for this event yet! Be the first to start a table using \`/bookevent\`.`;
        }

        await interaction.update({
            content: scheduleText,
            components: []
        });
    }
};
