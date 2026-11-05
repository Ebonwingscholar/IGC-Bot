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

    async handleSelectMenu(interaction) {
        // Step 3 (Start): Must show modal immediately without deferring
        if (interaction.customId === 'event_select_action' && interaction.values[0] === 'start') {
            const modal = new ModalBuilder()
                .setCustomId('event_start_modal')
                .setTitle('Host Event Table');

            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('modal_game')
                        .setLabel('Game System / Scenario')
                        .setPlaceholder('e.g. BattleTech 3025, Warhammer 40k, Board Games')
                        .setRequired(true)
                        .setStyle(TextInputStyle.Short)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('modal_max_players')
                        .setLabel('Max Players Allowed (up to 8)')
                        .setValue('8')
                        .setRequired(true)
                        .setStyle(TextInputStyle.Short)
                )
            );

            return interaction.showModal(modal);
        }

        // For all other menu steps, safe to defer update to prevent timeout
        await interaction.deferUpdate();

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
                ]);

            await interaction.editReply({
                content: `📅 Event Date: **${date}**\n\nStep 2 of 3: Select your session time slot:`,
                components: [new ActionRowBuilder().addComponents(slotMenu)]
            });
        } 
        else if (interaction.customId === 'event_select_slot') {
            const slot = interaction.values[0];
            const flow = activeEventFlows.get(interaction.user.id) || {};
            flow.slot = slot;
            activeEventFlows.set(interaction.user.id, flow);

            const actionMenu = new StringSelectMenuBuilder()
                .setCustomId('event_select_action')
                .setPlaceholder('⚔️ What would you like to do?')
                .addOptions([
                    { label: 'Start a new game / table', value: 'start', description: 'Host a new game and get an assigned table', emoji: '🟢' },
                    { label: 'Join an existing game / table', value: 'join', description: 'Join someone else already booked in this slot', emoji: '🟡' }
                ]);

            await interaction.editReply({
                content: `📅 Event Date: **${flow.date}** | ⏱️ Slot: **${slot}**\n\nStep 3 of 3: Do you want to start a new table or join an existing one?`,
                components: [new ActionRowBuilder().addComponents(actionMenu)]
            });
        }
        else if (interaction.customId === 'event_select_action') {
            const action = interaction.values[0];
            const flow = activeEventFlows.get(interaction.user.id) || {};

            if (action === 'join') {
                const joinable = eventManager.getJoinableTables(flow.date, flow.slot);
                if (joinable.length === 0) {
                    return interaction.editReply({
                        content: `❌ There are no open tables seeking players for **${flow.slot}** on **${flow.date}**. Try starting a new table instead!`,
                        components: []
                    });
                }

                const tableMenu = new StringSelectMenuBuilder()
                    .setCustomId('event_join_table')
                    .setPlaceholder('Select a table to join...')
                    .addOptions(
                        joinable.map(j => new StringSelectMenuOptionBuilder()
                            .setLabel(`Table ${j.tableNumber}: ${j.gameName}`)
                            .setDescription(`Host: ${j.organizer} | Players: ${j.currentPlayers}/${j.maxPlayers}`)
                            .setValue(`${j.tableNumber}`)
                        )
                    );

                await interaction.editReply({
                    content: `📅 Event Date: **${flow.date}** | ⏱️ Slot: **${flow.slot}**\n\nSelect a table to join:`,
                    components: [new ActionRowBuilder().addComponents(tableMenu)]
                });
            }
        }
        else if (interaction.customId === 'event_join_table') {
            const tableNumber = parseInt(interaction.values[0]);
            const flow = activeEventFlows.get(interaction.user.id);
            const nickname = interaction.member ? interaction.member.displayName : interaction.user.username;

            try {
                const updatedSlot = eventManager.joinBooking(flow.date, tableNumber, flow.slot, interaction.user.id, nickname);
                activeEventFlows.delete(interaction.user.id);

                await interaction.editReply({
                    content: `✅ Successfully joined **Table ${tableNumber}** (${updatedSlot.gameName}) for **${flow.slot}** on **${flow.date}**!`,
                    components: []
                });
            } catch (err) {
                await interaction.editReply({ content: `❌ ${err.message}`, components: [] });
            }
        }
    },

    async handleModalSubmit(interaction) {
        if (interaction.customId !== 'event_start_modal') return;

        await interaction.deferReply({ ephemeral: true });

        const flow = activeEventFlows.get(interaction.user.id) || {};
        const gameName = interaction.fields.getTextInputValue('modal_game').trim();
        const maxPlayers = parseInt(interaction.fields.getTextInputValue('modal_max_players').trim()) || 8;
        const nickname = interaction.member ? interaction.member.displayName : interaction.user.username;

        try {
            const tableNumber = eventManager.createBooking(
                flow.date,
                flow.slot,
                interaction.user.id,
                nickname,
                gameName,
                Math.min(maxPlayers, 8)
            );

            await this.sendPaymentReminder(interaction, tableNumber, gameName, flow.date, flow.slot);

            activeEventFlows.delete(interaction.user.id);

            await interaction.editReply({
                content: `✅ **Table ${tableNumber}** reserved for **${gameName}** (${flow.slot}) on **${flow.date}**!\n💳 Payment reminder has been sent to your DMs.`
            });
        } catch (err) {
            await interaction.editReply({ content: `❌ ${err.message}` });
        }
    },

    async sendPaymentReminder(interaction, tableNumber, gameName, date, slot) {
        try {
            const user = interaction.user;
            if (user) {
                await user.send(`
**Payment Reminder for Event Table ${tableNumber}**
Event Date: **${date}** (${slot})
Game: ${gameName}

Please pay your table fee before playing.
💳 **Bank Transfer Details**
- **Account Name:** ${process.env.BANK_ACCOUNT_NAME || 'Inverurie Gaming Club'}
- **Sort Code:** ${process.env.BANK_SORT_CODE || '12-34-56'}
- **Account Number:** ${process.env.BANK_ACCOUNT_NUMBER || '12345678'}

Reference: "Event Table ${tableNumber} ${date}"
                `);
            }
        } catch (err) {
            console.error('Could not send event payment DM:', err);
        }
    }
};