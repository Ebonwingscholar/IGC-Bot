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
const eventManager = require('../utils/eventManager');
require('dotenv').config();

// Temporary state store for event booking wizard
const activeEventFlows = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('bookevent')
        .setDescription('Book or join a table for an upcoming club event'),

    async execute(interaction) {
        // Fetch real upcoming events configured via /createevent
        const events = eventManager.getUpcomingEvents();

        if (!events || events.length === 0) {
            return interaction.reply({ 
                content: '❌ There are currently no club events scheduled for booking. An admin needs to create one using `/createevent`.', 
                ephemeral: true 
            });
        }

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('event_select_date')
            .setPlaceholder('📅 Choose an event date...')
            .addOptions(
                events.map(e => new StringSelectMenuOptionBuilder()
                    .setLabel(e.label || e.date)
                    .setValue(e.value || e.date)
                )
            );

        await interaction.reply({
            content: '🎲 **Inverurie Gaming Club - Event Booking**\nStep 1 of 4: Select event date:',
            components: [new ActionRowBuilder().addComponents(selectMenu)],
            ephemeral: true
        });
    },

    // Handle String Select Menus (Date, Slot, Action, Join Table)
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
                ]);

            await interaction.update({
                content: `📅 Date: **${date}**\n\nStep 2 of 4: Select your session time slot:`,
                components: [new ActionRowBuilder().addComponents(slotMenu)]
            });
        } 
        // Step 2: Slot Selected -> Choose Action (Start New Table vs Join Existing)
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

            await interaction.update({
                content: `📅 Date: **${flow.date}** | ⏱️ Slot: **${slot}**\n\nStep 3 of 4: Do you want to start a new table or join an existing one?`,
                components: [new ActionRowBuilder().addComponents(actionMenu)]
            });
        }
        // Step 3: Action Selected -> Player Select Menu (Start) or Join List (Join)
        else if (interaction.customId === 'event_select_action') {
            const action = interaction.values[0];
            const flow = activeEventFlows.get(interaction.user.id) || {};
            flow.action = action;
            activeEventFlows.set(interaction.user.id, flow);

            if (action === 'start') {
                // Show User Select Menu to tag additional players before opening modal
                const playerSelect = new UserSelectMenuBuilder()
                    .setCustomId('event_select_players')
                    .setPlaceholder('👥 Tag additional players joining your table (Optional)...')
                    .setMinValues(0)
                    .setMaxValues(7);

                await interaction.update({
                    content: `📅 Date: **${flow.date}** | ⏱️ Slot: **${flow.slot}**\n\nStep 4 of 4: Select additional members joining your table (or skip):`,
                    components: [new ActionRowBuilder().addComponents(playerSelect)]
                });
            } else {
                // Show list of joinable tables
                const joinable = eventManager.getJoinableTables(flow.date, flow.slot);
                if (joinable.length === 0) {
                    return interaction.update({
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

                await interaction.update({
                    content: `📅 Date: **${flow.date}** | ⏱️ Slot: **${flow.slot}**\n\nSelect a table to join:`,
                    components: [new ActionRowBuilder().addComponents(tableMenu)]
                });
            }
        }
        // Table Chosen to Join -> Execute Join
        else if (interaction.customId === 'event_join_table') {
            const tableNumber = parseInt(interaction.values[0]);
            const flow = activeEventFlows.get(interaction.user.id);
            const nickname = interaction.member ? interaction.member.displayName : interaction.user.username;

            try {
                const updatedSlot = eventManager.joinBooking(flow.date, tableNumber, flow.slot, interaction.user.id, nickname);
                activeEventFlows.delete(interaction.user.id);

                await interaction.update({
                    content: `✅ Successfully joined **Table ${tableNumber}** (${updatedSlot.gameName}) for **${flow.slot}** on **${flow.date}**!`,
                    components: []
                });
            } catch (err) {
                await interaction.update({ content: `❌ ${err.message}`, components: [] });
            }
        }
    },

    // Step 4 (Start): User Select Menu -> Capture Tagged Players and Show Modal IMMEDIATELY
    async handleUserSelect(interaction) {
        if (interaction.customId !== 'event_select_players') return;

        const flow = activeEventFlows.get(interaction.user.id) || {};
        
        // Save tagged users into wizard flow
        const selectedUsers = Array.from(interaction.users.values());
        flow.additionalPlayers = selectedUsers.map(u => ({
            id: u.id,
            name: u.displayName || u.username
        }));
        
        activeEventFlows.set(interaction.user.id, flow);

        // Show Modal immediately (Must be direct response without deferring)
        const modal = new ModalBuilder()
            .setCustomId('event_start_modal')
            .setTitle('Host Event Table');

        modal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('modal_game')
                    .setLabel('Game System / Scenario')
                    .setPlaceholder('e.g. Warhammer 40k, Marvel Crisis Protocol')
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
    },

    // Step 5 (Start): Modal Submitted -> Create Booking & Send Payment DM
    async handleModalSubmit(interaction) {
        if (interaction.customId !== 'event_start_modal') return;

        await interaction.deferReply({ ephemeral: true });

        const flow = activeEventFlows.get(interaction.user.id) || {};
        const gameName = interaction.fields.getTextInputValue('modal_game').trim();
        const maxPlayers = parseInt(interaction.fields.getTextInputValue('modal_max_players').trim()) || 8;
        const hostNickname = interaction.member ? interaction.member.displayName : interaction.user.username;

        // Construct initial roster: Host first, then any tagged users
        const initialRoster = [{ id: interaction.user.id, name: hostNickname }];
        if (flow.additionalPlayers && flow.additionalPlayers.length > 0) {
            flow.additionalPlayers.forEach(p => {
                if (p.id !== interaction.user.id) {
                    initialRoster.push(p);
                }
            });
        }

        try {
            const tableNumber = eventManager.createBooking(
                flow.date,
                flow.slot,
                interaction.user.id,
                hostNickname,
                gameName,
                Math.min(maxPlayers, 8),
                initialRoster
            );

            // Send Payment Reminder DM to Host
            await this.sendPaymentReminder(interaction.user.id, tableNumber, gameName, flow.date, flow.slot);

            activeEventFlows.delete(interaction.user.id);

            const rosterMentions = initialRoster.map(p => `<@${p.id}>`).join(', ');

            await interaction.editReply({
                content: `✅ **Table ${tableNumber}** reserved for **${gameName}** (${flow.slot}) on **${flow.date}**!\n**Roster:** ${rosterMentions}\n💳 Payment reminder has been sent to your DMs.`
            });
        } catch (err) {
            await interaction.editReply({ content: `❌ ${err.message}` });
        }
    },

    async sendPaymentReminder(userId, tableNumber, gameName, date, slot) {
        try {
            const { client } = require('../index');
            const user = await client.users.fetch(userId);
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
