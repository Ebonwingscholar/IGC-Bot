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
require('dotenv').config();

// Temporary memory store for multi-step ephemeral flows (date & players selected)
const activeReservations = new Map();

/**
 * Calculates upcoming fortnightly (every 2nd week) Thursday club dates.
 * Anchored to Thursday, 5 November 2026.
 */
function getUpcomingThursdays(count = 4) {
    const thursdays = [];
    const now = new Date();

    // Anchor Date: Thursday, 5 November 2026
    const anchorDate = new Date(2026, 10, 5); 
    anchorDate.setHours(0, 0, 0, 0);

    const msPerDay = 24 * 60 * 60 * 1000;
    const msPerFortnight = 14 * msPerDay;

    let currentSession = new Date(anchorDate.getTime());
    
    // Cutoff on session day at 22:00
    const todayCutoff = new Date(now);
    todayCutoff.setHours(22, 0, 0, 0);

    while (currentSession < now && (now.toDateString() !== currentSession.toDateString() || now > todayCutoff)) {
        currentSession = new Date(currentSession.getTime() + msPerFortnight);
    }

    for (let i = 0; i < count; i++) {
        const dateStr = currentSession.toISOString().split('T')[0];
        const label = currentSession.toLocaleDateString('en-GB', { 
            weekday: 'long', 
            day: 'numeric', 
            month: 'short', 
            year: 'numeric' 
        });

        thursdays.push({ label, value: dateStr });
        currentSession = new Date(currentSession.getTime() + msPerFortnight);
    }

    return thursdays;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('reserve')
        .setDescription('Reserve a table for an upcoming fortnightly Thursday club night'),

    async execute(interaction) {
        const thursdays = getUpcomingThursdays(4);

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('select_reserve_date')
            .setPlaceholder('1️⃣ Choose a Thursday club session...')
            .addOptions(
                thursdays.map(t => new StringSelectMenuOptionBuilder()
                    .setLabel(t.label)
                    .setValue(t.value)
                )
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await interaction.reply({
            content: '📅 **Inverurie Gaming Club - Table Reservation**\nStep 1 of 2: Select your fortnightly club session date:',
            components: [row],
            ephemeral: true
        });
    },

    // Step 1: Date Selected -> Prompt for Players using a User Select Menu
    async handleSelectMenu(interaction) {
        if (interaction.customId !== 'select_reserve_date') return;

        const selectedDate = interaction.values[0];

        // Store date temporarily for this user
        activeReservations.set(interaction.user.id, { date: selectedDate });

        const userSelect = new UserSelectMenuBuilder()
            .setCustomId('select_reserve_players')
            .setPlaceholder('Select gaming partners /
