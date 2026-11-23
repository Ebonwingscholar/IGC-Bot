const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Learn how to use the Inverurie Gaming Club table reservation bot'),

    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('🎲 Inverurie Gaming Club — Bot Guide')
            .setDescription('Welcome! We use interactive slash commands to reserve gaming tables for **Thursday Club Nights** and **Special Events**, as well as find fellow players by game.')
            .addFields(
                {
                    name: '🍺 /book',
                    value: 'Reserve a new table or join an open table roster.\n• Choose between **Thursday Club Night** or a **Special Event**.\n• Select an open date from the dropdown.\n• Pick whether to start a new table or join an existing roster.\n• Tag your fellow players (up to 8) and enter your game system.'
                },
                {
                    name: '❌ /cancel',
                    value: 'Manage your existing table bookings or leave a roster.\n• Select **Thursday** or **Special Event**.\n• Pick the date you wish to modify.\n• Choose to either **cancel your entire table** (if host) or **remove yourself** from a player roster.'
                },
                {
                    name: '🔍 /view',
                    value: 'View all active table reservations and available slots.\n• Select **Thursday** or **Special Event**.\n• Pick the date to view the table schedule, host details, and roster lists.'
                },
                {
                    name: '👥 /playerfinder',
                    value: 'Browse who plays a game and share your armies or notes.\n• Pick a game system from the dropdown to see its current player list.\n• Click **Join Roster** / **Edit My Details** to add yourself or share armies, game sizes, and preferences.\n• Click **Leave Roster** to remove yourself from that game.'
                },
                {
                    name: '🛡️ Admin Commands',
                    value: '• `/adminmanage` — Create tables for players, add/remove roster members, or edit game details for Thursdays and events.\n• `/adminmanageevents` — Create new special events, edit an event date/name while keeping bookings, or cancel an event.\n• `/closedates` — Manage club closure dates so they are skipped in booking schedules.'
                }
            )
            .setFooter({ text: 'Inverurie Gaming Club Bot', iconURL: interaction.guild ? interaction.guild.iconURL() : null })
            .setTimestamp();

        // Reply non-ephemerally so everyone in the channel can read the guide
        await interaction.reply({ embeds: [embed] });
    }
};
