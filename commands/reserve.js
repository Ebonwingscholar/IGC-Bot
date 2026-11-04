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

function getUpcomingThursdays(count = 4) {
    const thursdays = [];
    const now = new Date();
    let d = new Date(now);
    let dayOfWeek = d.getDay();
    let daysUntilThu = (4 - dayOfWeek + 7) % 7;
    
    if (daysUntilThu === 0 && now.getHours() >= 22) {
        daysUntilThu = 7;
    }
    
    d.setDate(d.getDate() + daysUntilThu);

    for (let i = 0; i < count; i++) {
        const dateStr = d.toISOString().split('T')[0];
        const label = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
        thursdays.push({ label, value: dateStr });
        d.setDate(d.getDate() + 7);
    }
    return thursdays;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('reserve')
        .setDescription('Reserve a table for an upcoming Thursday club night'),

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
            content: '📅 **Inverurie Gaming Club - Table Reservation**\nStep 1 of 2: Select your club session date:',
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
            .setPlaceholder('Select gaming partners / opponents...')
            .setMinValues(1)
            .setMaxValues(3); // Up to 3 additional players

        const row = new ActionRowBuilder().addComponents(userSelect);

        await interaction.update({
            content: `📅 Date selected: **Thursday, ${selectedDate}**\n\nStep 2 of 2: Tag or select your playing partners below (you are included automatically):`,
            components: [row]
        });
    },

    // Step 2: Players Selected -> Open Modal for Game & Session
    async handleUserSelect(interaction) {
        if (interaction.customId !== 'select_reserve_players') return;

        const sessionData = activeReservations.get(interaction.user.id) || {};
        sessionData.playerIds = interaction.values; // Array of selected user IDs
        activeReservations.set(interaction.user.id, sessionData);

        const modal = new ModalBuilder()
            .setCustomId('reserve_final_modal')
            .setTitle('Finalise Table Reservation');

        const gameInput = new TextInputBuilder()
            .setCustomId('modal_game')
            .setLabel('Game System / Scenario')
            .setPlaceholder('e.g. Warhammer 40k 2000pts, BattleTech')
            .setRequired(true)
            .setStyle(TextInputStyle.Short);

        const sessionInput = new TextInputBuilder()
            .setCustomId('modal_session')
            .setLabel('Session Slot')
            .setValue('Evening 18:00-22:00')
            .setRequired(true)
            .setStyle(TextInputStyle.Short);

        modal.addComponents(
            new ActionRowBuilder().addComponents(gameInput),
            new ActionRowBuilder().addComponents(sessionInput)
        );

        await interaction.showModal(modal);
    },

    // Step 3: Modal Submitted -> Save & DM All Tagged Users
    async handleModalSubmit(interaction) {
        if (interaction.customId !== 'reserve_final_modal') return;

        const sessionData = activeReservations.get(interaction.user.id) || {};
        const targetDate = sessionData.date;
        const playerIds = sessionData.playerIds || [];
        
        // Ensure the person making the reservation is included in the list
        if (!playerIds.includes(interaction.user.id)) {
            playerIds.unshift(interaction.user.id);
        }

        const session = interaction.fields.getTextInputValue('modal_session').trim();
        const gameName = interaction.fields.getTextInputValue('modal_game').trim();

        try {
            // Fetch guild member display names for nice formatting
            const playerNamesArray = await Promise.all(playerIds.map(async id => {
                try {
                    if (interaction.guild) {
                        const member = await interaction.guild.members.fetch(id);
                        return member.displayName || member.user.username;
                    }
                    const user = await interaction.client.users.fetch(id);
                    return user.username;
                } catch {
                    return 'Player';
                }
            }));

            const playerNames = playerNamesArray.join(', ');

            const tableNumber = tableManager.addReservation(
                interaction.user.id,
                interaction.user.tag,
                playerNames,
                gameName,
                targetDate,
                session
            );

            // Send DMs to ALL tagged players
            await this.sendPaymentReminder(playerIds, tableNumber, playerNames, gameName, targetDate);

            activeReservations.delete(interaction.user.id);

            await interaction.reply({
                content: `✅ Table ${tableNumber} reserved for **${playerNames}** playing **${gameName}** on **Thursday, ${targetDate}** (${session})!\n💳 Payment reminders have been DMed to all participants.`,
                ephemeral: true
            });
        } catch (err) {
            await interaction.reply({ content: `❌ ${err.message}`, ephemeral: true });
        }
    },

    async sendPaymentReminder(userIds, tableNumber, playerNames, gameName, date) {
        try {
            const { client } = require('../index');
            const reminderMessage = `
**Payment Reminder for Table ${tableNumber}**
Session Date: **Thursday, ${date}**
Reservation: ${playerNames} — Game: ${gameName}

Please pay your table fee before playing.
💳 **Bank Transfer Details**
- **Account Name:** ${process.env.BANK_ACCOUNT_NAME || 'Inverurie Gaming Club'}
- **Sort Code:** ${process.env.BANK_SORT_CODE || '12-34-56'}
- **Account Number:** ${process.env.BANK_ACCOUNT_NUMBER || '12345678'}

Reference: "Table ${tableNumber} ${date}"
            `;
            for (const id of userIds) {
                try {
                    const user = await client.users.fetch(id);
                    if (user) await user.send(reminderMessage);
                } catch {}
            }
        } catch (error) {
            console.error('Error sending payment reminders:', error);
        }
    }
};
