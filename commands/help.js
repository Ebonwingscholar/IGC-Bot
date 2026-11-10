const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Learn how to use the Inverurie Gaming Club table reservation bot'),

    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('🎲 Inverurie Gaming Club — Table Reservation Guide')
            .setDescription('Welcome! We use interactive slash commands to reserve and manage gaming tables for both **Thursday Club Nights** and **Special Weekend Events**.')
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
                    value: 'View all active table reservations and available slots.\n• Select the category (Thursday or Event).\n• Pick the upcoming date to view the full public table schedule, host details, and roster lists.'
                },
                {
                    name: '🛡️ Admin Commands',
                    value: '• `/closedates` — Manage club closures (skips dates automatically in `/book` and `/view`).\n• `/adminmanage` — Override or adjust rosters and game details.'
                }
            )
            .setFooter({ text: 'Inverurie Gaming Club Bot', iconURL: interaction.guild ? interaction.guild.iconURL() : null })
            .setTimestamp();

        // Reply non-ephemerally so everyone in the channel can read the guide
        await interaction.reply({ embeds: [embed] });
    }
};
