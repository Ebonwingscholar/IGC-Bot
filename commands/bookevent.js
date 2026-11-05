const { 
    SlashCommandBuilder, 
    ActionRowBuilder, 
    StringSelectMenuBuilder, 
    StringSelectMenuOptionBuilder,
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle
} = require('discord.js');
const eventManager = require('../utils/eventManager');
require('dotenv').config();

// Temporary state store for event booking wizard
const activeEventFlows = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('bookevent')
        .setDescription('Book or join a table for an upcoming club event'),

    async execute(interaction) {
        const events = eventManager.getUpcomingEvents();

        if (events.length === 0) {
            return interaction.reply({
                content: '❌ There are currently no upcoming club events scheduled. Check back later!',
                ephemeral: true
            });
        }

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('event_select_date')
            .setPlaceholder('📅 Choose an upcoming event...')
            .addOptions(
                events.map(e => new StringSelectMenuOptionBuilder()
                    .setLabel(e.label)
                    .setValue(e.value)
                )
            );

        await interaction.reply({
            content: '🎲 **Inverurie Gaming Club - Event Booking**\nStep 1 of 3: Select an upcoming event:',
            components: [new ActionRowBuilder().addComponents(selectMenu)],
            ephemeral: true
        });
    },

    // Step 1: Date Selected -> Choose Slot (AM, PM, Whole Day)
    async handleSelectMenu(interaction) {
        if (interaction.customId === 'event_select_date') {
            const date = interaction.values[0];
            activeEventFlows.set(interaction.user.id, { date });

            const slotMenu = new StringSelectMenuBuilder()
                .setCustomId('event_select_slot')
                .setPlaceholder('⏱️ Choose your time slot...')
                .addOptions([
                    { label: 'Morning Session (AM)', value: 'AM', description: '09:00 - 13:00' },
                    { label: 'Afternoon Session (PM)', value: 'PM', description: '13:30 - 17:30' },
                    { label: 'Whole Day', value: 'Whole Day', description: '09:00 - 17:30 (Both AM & PM)' }
