const { 
    SlashCommandBuilder, 
    ActionRowBuilder, 
    StringSelectMenuBuilder, 
    StringSelectMenuOptionBuilder,
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle 
} = require('discord.js');
const tableManager = require('../utils/tableManager');
require('dotenv').config();

/**
 * Generates the next N upcoming Thursday dates (Day 4 = Thursday).
 */
function getUpcomingThursdays(count = 4) {
    const thursdays = [];
    const now = new Date();
    
    // Find the next Thursday
    let d = new Date(now);
    let dayOfWeek = d.getDay();
    let daysUntilThu = (4 - dayOfWeek + 7) % 7;
    
    // If today is Thursday but past 22:00, start from next week
    if (daysUntilThu === 0 && now.getHours() >= 22) {
        daysUntilThu = 7;
    }
    
    d.setDate(d.getDate() + daysUntilThu);

    for (let i = 0; i < count; i++) {
        const dateStr = d.toISOString().split('T')[0];
        // Format nicely for humans e.g. "Thursday, 12 Nov 2026"
        const label = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
        
        thursdays.push({ label, value: dateStr });
        
        // Move to next Thursday
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
            .setPlaceholder('Choose a Thursday club session...')
            .addOptions(
                thursdays.map(t => new StringSelectMenuOptionBuilder()
                    .setLabel(t.label)
                    .setValue(t.value)
                )
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await interaction.reply({
            content: '📅 **Inverurie Gaming Club - Table Reservation**\nSelect which Thursday session you would like to book a table for:',
            components: [row],
            ephemeral: true
        });
    },

    // Handles the date selection from the dropdown and opens the modal
    async handleSelectMenu(interaction) {
        if (interaction.customId !== 'select_reserve_date') return;

        const selectedDate = interaction.values[0];

        const modal = new ModalBuilder()
            .setCustomId(`reserve_modal_${selectedDate}`)
            .setTitle(`Book Table (${selectedDate})`);

        const playersInput = new TextInputBuilder()
            .setCustomId('modal_players')
            .setLabel('Players / Opponents')
            .setPlaceholder('e.g. Grant, Jason')
            .setRequired(true)
            .setStyle(TextInputStyle.Short);

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
            new ActionRowBuilder().addComponents(playersInput),
            new ActionRowBuilder().addComponents(gameInput),
            new ActionRowBuilder().addComponents(sessionInput)
        );

        await interaction.showModal(modal);
    },

    async handleModalSubmit(interaction) {
        // Extract date from customId (e.g. "reserve_modal_2026-11-12")
        const targetDate = interaction.customId.replace('reserve_modal_', '');
        const session = interaction.fields.getTextInputValue('modal_session').trim();
        const playerNames = interaction.fields.getTextInputValue('modal_players').trim();
        const gameName = interaction.fields.getTextInputValue('modal_game').trim();

        try {
            const tableNumber = tableManager.addReservation(
                interaction.user.id,
                interaction.user.tag,
                playerNames,
                gameName,
                targetDate,
                session
            );

            await this.sendPaymentReminder([interaction.user], tableNumber, playerNames, gameName, targetDate);

            await interaction.reply({
                content: `✅ Table ${tableNumber} reserved for **${playerNames}** playing **${gameName}** on **Thursday, ${targetDate}** (${session})!`,
                ephemeral: true
            });
        } catch (err) {
            await interaction.reply({ content: `❌ ${err.message}`, ephemeral: true });
        }
    },

    async sendPaymentReminder(users, tableNumber, playerNames, gameName, date) {
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

Reference: "D Smith ${date}"
            `;
            for (const user of users) {
                try {
                    const fetchedUser = await client.users.fetch(user.id);
                    if (fetchedUser) await fetchedUser.send(reminderMessage);
                } catch {}
            }
        } catch (error) {
            console.error('Error sending payment reminders:', error);
        }
    }
};
