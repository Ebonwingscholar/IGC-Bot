const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const eventManager = require('../utils/eventManager');

function getUpcomingEventDates() {
    const dates = [];
    const now = new Date();
    let d = new Date(now);
    let day = d.getDay();
    let diff = (6 - day + 7) % 7;
    if (diff === 0 && now.getHours() >= 18) diff = 7;
    d.setDate(d.getDate() + diff);

    for (let i = 0; i < 4; i++) {
        const value = d.toISOString().split('T')[0];
        const label = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
        dates.push({ label, value });
        d.setDate(d.getDate() + 7);
    }
    return dates;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('viewevents')
        .setDescription('View the table schedule and player rosters for club events'),

    async execute(interaction) {
        const dates = getUpcomingEventDates();

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('view_event_date')
            .setPlaceholder('📅 Select event date to view...')
            .addOptions(
                dates.map(d => new StringSelectMenuOptionBuilder().setLabel(d.label).setValue(d.value))
            );

        // PUBLIC INITIAL REPLY: ephemeral property removed so everyone can see the menu and result
        await interaction.reply({
            content: '📊 **Inverurie Gaming Club - Event Schedules**\nSelect an event date to view:',
            components: [new ActionRowBuilder().addComponents(selectMenu)]
        });
    },

    async handleSelectMenu(interaction) {
        if (interaction.customId !== 'view_event_date') return;

        const dateStr = interaction.values[0];
        const eventData = eventManager.getEventData(dateStr);
        const tables = eventData.tables;

        let scheduleText = `🎲 **Event Table Schedule — ${dateStr}**\n\n`;
        let activeCount = 0;

        for (let i = 1; i <= eventManager.MAX_TABLES; i++) {
            const t = tables[i];
            if (!t.am && !t.pm) continue;

            activeCount++;
            scheduleText += `📌 **Table ${i}**\n`;

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
            scheduleText = `📅 **Event Table Schedule — ${dateStr}**\n\nNo tables have been booked for this event yet! Be the first to book using \`/bookevent\`.`;
        }

        // PUBLIC UPDATE: Replaces the prompt message with the public schedule view
        await interaction.update({
            content: scheduleText,
            components: []
        });
    }
};
