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
const fs = require('fs');
const path = require('path');
const tableManager = require('../utils/tableManager');
require('dotenv').config();

// Temporary memory store for multi-step ephemeral flows (date & players selected)
const activeReservations = new Map();

/**
 * Reads closed dates from data/closed-dates.json
 */
function getClosedDates() {
    try {
        const filePath = path.join(__dirname, '../data/closed-dates.json');
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
    } catch (err) {
        console.error('Error reading closed-dates.json:', err);
    }
    return [];
}

/**
 * Calculates upcoming fortnightly (every 2nd week) Thursday club dates, skipping any closed dates.
 * Anchor: Thursday, 5 November 2026.
 */
function getUpcomingThursdays(count = 4) {
    const thursdays = [];
    const closedDates = getClosedDates();
    
    // Fixed anchor: Thursday, Nov 5, 2026 00:00:00 UTC
    const anchorTime = Date.UTC(2026, 10, 5); 
    const msPerFortnight = 14 * 24 * 60 * 60 * 1000;

    const now = new Date();
    const nowTime = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());

    let intervals = Math.floor((nowTime - anchorTime) / msPerFortnight);
    if (intervals < 0) intervals = 0;

    let nextSessionTime = anchorTime + (intervals * msPerFortnight);

    if (nowTime === nextSessionTime && now.getHours() >= 22) {
        nextSessionTime += msPerFortnight;
    } else if (nextSessionTime < nowTime) {
        nextSessionTime += msPerFortnight;
    }

    // Keep advancing fortnightly intervals until we collect 'count' open dates
    while (thursdays.length < count) {
        const sessionDate = new Date(nextSessionTime);
        
        const year = sessionDate.getUTCFullYear();
        const month = String(sessionDate.getUTCMonth() + 1).padStart(2, '0');
        const day = String(sessionDate.getUTCDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;

        // Skip if this date is listed in closed-dates.json
        if (!closedDates.includes(dateStr)) {
            const label = sessionDate.toLocaleDateString('en-GB', { 
                weekday: 'long', 
                day: 'numeric', 
                month: 'short', 
                year: 'numeric',
                timeZone: 'UTC'
            });

            thursdays.push({ label, value: dateStr });
        }

        nextSessionTime += msPerFortnight;
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
            .setPlaceholder('Select gaming partners / opponents...')
            .setMinValues(1)
            .setMaxValues(5);

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
        sessionData.playerIds = interaction.values;
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

        await interaction.deferReply({ ephemeral: true });

        const sessionData = activeReservations.get(interaction.user.id) || {};
        const targetDate = sessionData.date;
        const playerIds = sessionData.playerIds || [];
        
        if (!playerIds.includes(interaction.user.id)) {
            playerIds.unshift(interaction.user.id);
        }

        const session = interaction.fields.getTextInputValue('modal_session').trim();
        const gameName = interaction.fields.getTextInputValue('modal_game').trim();

        try {
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

            await this.sendPaymentReminder(playerIds, tableNumber, playerNames, gameName, targetDate);

            activeReservations.delete(interaction.user.id);

            await interaction.editReply({
                content: `✅ Table ${tableNumber} reserved for **${playerNames}** playing **${gameName}** on **Thursday, ${targetDate}** (${session})!\n💳 Payment reminders have been DMed to all participants.`
            });
        } catch (err) {
            await interaction.editReply({ content: `❌ ${err.message}` });
        }
    },

    async handleDM(message, detailsText) {
        const userId = message.author.id;
        const username = message.author.tag;

        if (!detailsText || detailsText.trim() === '') {
            await message.reply('Format: `!reserve Player1, Player2 + Game Name`');
            return;
        }

        try {
            let playerNames, gameName;
            if (detailsText.includes('+')) {
                const parts = detailsText.split('+');
                playerNames = parts[0].trim();
                gameName = parts[1].trim();
            } else {
                playerNames = detailsText.trim();
                gameName = 'Unspecified Game';
            }

            const targetDate = getUpcomingThursdays(1)[0].value;
            const tableNumber = tableManager.addReservation(userId, username, playerNames, gameName, targetDate);
            await this.sendPaymentReminder([userId], tableNumber, playerNames, gameName, targetDate);
            await message.reply(`Table ${tableNumber} reserved for ${playerNames} playing ${gameName} on ${targetDate}.`);
        } catch (error) {
            await message.reply(`Error: ${error.message}`);
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
