const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const eventManager = require('../utils/eventManager');

// Helper to format player rosters cleanly with Discord mentions prioritized
function formatPlayerList(players) {
    if (!players || players.length === 0) return 'None';
    return players.map(p => {
        if (typeof p === 'string') return p;
        if (p.id) return `<@${p.id}>`;
        if (p.name) return p.name;
        return 'Unknown Player';
    }).join(', ');
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('viewevents')
        .setDescription('View the table schedule and player rosters for club events'),

    async execute(interaction) {
        // Fetch real upcoming events configured via /createevent
        const events = eventManager.getUpcomingEvents();

        if (!events || events.length === 0) {
            return interaction.reply({ 
                content: '❌ There are currently no upcoming club events scheduled to view.', 
                ephemeral: true 
            });
        }

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('view_event_date')
            .setPlaceholder('📅 Select event date to view...')
            .addOptions(
                events.map(e => new StringSelectMenuOptionBuilder()
                    .setLabel(e.label || e.date)
                    .setValue(e.value || e.date)
                )
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
                const pList = formatPlayerList(t.am.players);
                scheduleText += `• 🟢 **Whole Day:** ${t.am.gameName}\n  Players (${t.am.players.length}/${t.am.maxPlayers}): ${pList}\n`;
            } else {
                if (t.am) {
                    const pList = formatPlayerList(t.am.players);
                    scheduleText += `• 🌅 **AM (09:00-13:00):** ${t.am.gameName}\n  Players (${t.am.players.length}/${t.am.maxPlayers}): ${pList}\n`;
                } else {
                    scheduleText += `• 🌅 **AM:** *AVAILABLE*\n`;
                }

                if (t.pm) {
                    const pList = formatPlayerList(t.pm.players);
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
