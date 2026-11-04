const { 
    SlashCommandBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    EmbedBuilder 
} = require('discord.js');
const tableManager = require('../utils/tableManager');
const { isValidDate } = require('../utils/dateUtils');
require('dotenv').config();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('reserve')
        .setDescription('Reserve a table for your game')
        .addStringOption(option => option.setName('date').setDescription('Date (YYYY-MM-DD)').setRequired(false))
        .addStringOption(option => option.setName('session').setDescription('Session slot').setRequired(false))
        .addUserOption(option => option.setName('player1').setDescription('First player').setRequired(false))
        .addStringOption(option => option.setName('game').setDescription('Game name').setRequired(false))
        .addUserOption(option => option.setName('player2').setDescription('Second player').setRequired(false))
        .addUserOption(option => option.setName('player3').setDescription('Third player').setRequired(false)),

    async execute(interaction) {
        const player1 = interaction.options.getUser('player1');
        const game = interaction.options.getString('game');

        if (!player1 && !game) {
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('🎲 Inverurie Gaming Club - Table Reservation')
                .setDescription('Click the button below to open the quick booking form, select your session date, and reserve a table!');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('open_reserve_modal')
                    .setLabel('📅 Reserve a Table')
                    .setStyle(ButtonStyle.Primary)
            );

            await interaction.reply({ embeds: [embed], components: [row] });
            return;
        }

        const userId = interaction.user.id;
        const username = interaction.user.tag;
        const date = interaction.options.getString('date') || new Date().toISOString().split('T')[0];
        const session = interaction.options.getString('session') || 'Evening 18:00-22:00';

        if (!isValidDate(date)) {
            await interaction.reply({ content: '❌ Please provide a valid calendar date in YYYY-MM-DD format.', ephemeral: true });
            return;
        }

        const today = new Date().toISOString().split('T')[0];
        if (date < today) {
            await interaction.reply({ content: '❌ You cannot book a table for a date in the past.', ephemeral: true });
            return;
        }

        const players = [player1 || interaction.user];
        for (let i = 2; i <= 3; i++) {
            const user = interaction.options.getUser(`player${i}`);
            if (user) players.push(user);
        }

        const gameName = game || 'Unspecified Game';

        try {
            const playerNamesArray = await Promise.all(players.map(async u => {
                try {
                    if (interaction.guild) {
                        const m = await interaction.guild.members.fetch(u.id);
                        return m.displayName || u.username;
                    }
                } catch {}
                return u.username;
            }));

            const playerNames = playerNamesArray.join(', ');
            const tableNumber = tableManager.addReservation(userId, username, playerNames, gameName, date, session);
            await this.sendPaymentReminder([interaction.user], tableNumber, playerNames, gameName, date);
            
            await interaction.reply(`✅ Table ${tableNumber} has been reserved for **${playerNames}** playing **${gameName}** on **${date}** (${session}).`);
        } catch (error) {
            console.error('Error executing reserve:', error);
            await interaction.reply({ content: `❌ ${error.message || 'An error occurred.'}`, ephemeral: true });
        }
    },

    async showModal(interaction) {
        const modal = new ModalBuilder()
            .setCustomId('reserve_table_modal')
            .setTitle('Wargaming Table Reservation');

        const dateInput = new TextInputBuilder()
            .setCustomId('modal_date')
            .setLabel('Date (YYYY-MM-DD)')
            .setValue(new Date().toISOString().split('T')[0])
            .setRequired(true)
            .setStyle(TextInputStyle.Short);

        const sessionInput = new TextInputBuilder()
            .setCustomId('modal_session')
            .setLabel('Session Slot (e.g. Evening 18:00-22:00)')
            .setValue('Evening 18:00-22:00')
            .setRequired(true)
            .setStyle(TextInputStyle.Short);

        const playersInput = new TextInputBuilder()
            .setCustomId('modal_players')
            .setLabel('Players / Opponents')
            .setPlaceholder('e.g. Grant, Jason')
            .setRequired(true)
            .setStyle(TextInputStyle.Short);

        const gameInput = new TextInputBuilder()
            .setCustomId('modal_game')
            .setLabel('Game System / Scenario')
            .setPlaceholder('e.g. Warhammer 40k 2000pts')
            .setRequired(true)
            .setStyle(TextInputStyle.Short);

        modal.addComponents(
            new ActionRowBuilder().addComponents(dateInput),
            new ActionRowBuilder().addComponents(sessionInput),
            new ActionRowBuilder().addComponents(playersInput),
            new ActionRowBuilder().addComponents(gameInput)
        );

        await interaction.showModal(modal);
    },

    async handleModalSubmit(interaction) {
        const date = interaction.fields.getTextInputValue('modal_date').trim();
        const session = interaction.fields.getTextInputValue('modal_session').trim();
        const playerNames = interaction.fields.getTextInputValue('modal_players').trim();
        const gameName = interaction.fields.getTextInputValue('modal_game').trim();

        if (!isValidDate(date)) {
            await interaction.reply({ content: '❌ Please provide a valid calendar date in YYYY-MM-DD format.', ephemeral: true });
            return;
        }

        const today = new Date().toISOString().split('T')[0];
        if (date < today) {
            await interaction.reply({ content: '❌ You cannot book a table for a date in the past.', ephemeral: true });
            return;
        }

        try {
            const tableNumber = tableManager.addReservation(
                interaction.user.id,
                interaction.user.tag,
                playerNames,
                gameName,
                date,
                session
            );

            await this.sendPaymentReminder([interaction.user], tableNumber, playerNames, gameName, date);

            await interaction.reply({
                content: `✅ Table ${tableNumber} reserved for **${playerNames}** playing **${gameName}** on **${date}** (${session})!`,
                ephemeral: true
            });
        } catch (err) {
            await interaction.reply({ content: `❌ ${err.message}`, ephemeral: true });
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

            const date = new Date().toISOString().split('T')[0];
            const tableNumber = tableManager.addReservation(userId, username, playerNames, gameName, date);
            await this.sendPaymentReminder([{ id: userId }], tableNumber, playerNames, gameName, date);
            await message.reply(`Table ${tableNumber} reserved for ${playerNames} playing ${gameName} on ${date}.`);
        } catch (error) {
            await message.reply(`Error: ${error.message}`);
        }
    },

    async sendPaymentReminder(users, tableNumber, playerNames, gameName, date) {
        try {
            const { client } = require('../index');
            const reminderMessage = `
**Payment Reminder for Table ${tableNumber}**
Event/Session Date: **${date}**
Reservation: ${playerNames} — Game: ${gameName}

Please pay your table fee before playing.
💳 **Bank Transfer Details**
• **Account Name:** ${process.env.BANK_ACCOUNT_NAME || 'Inverurie Gaming Club'}
• **Sort Code:** ${process.env.BANK_SORT_CODE || '12-34-56'}
• **Account Number:** ${process.env.BANK_ACCOUNT_NUMBER || '12345678'}

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
