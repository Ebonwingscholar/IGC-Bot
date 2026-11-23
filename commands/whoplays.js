const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } = require('discord.js');

// Single source of truth: add or update game roles here
const GAME_ROLES = [
    { key: '40k', label: 'Warhammer 40k', roleId: '1446511133228929056' },
    { key: 'aos', label: 'Age of Sigmar', roleId: '1446510570403532890' },
    { key: 'killteam', label: 'Kill Team', roleId: '1403387824841162752' },
    { key: 'other', label: 'All Other Games', roleId: '1446548080630698056' }
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('whoplays')
        .setDescription('Show who is interested in a specific game'),

    async execute(interaction) {
        if (!interaction.guild) {
            return interaction.reply({
                content: '❌ This command can only be used inside the server.',
                ephemeral: true
            });
        }

        const menu = new StringSelectMenuBuilder()
            .setCustomId('whoplays_game_select')
            .setPlaceholder('🎲 Select a game roster to view...')
            .addOptions(
                GAME_ROLES.map(game => ({
                    label: game.label,
                    value: game.key
                }))
            );

        const row = new ActionRowBuilder().addComponents(menu);

        await interaction.reply({
            content: 'Choose a game to view its player roster:',
            components: [row],
            ephemeral: true
        });
    },

    async handleSelectMenu(interaction) {
        if (interaction.customId !== 'whoplays_game_select') return;

        await interaction.deferUpdate();

        const chosenKey = interaction.values[0];
        const gameConfig = GAME_ROLES.find(g => g.key === chosenKey);
        const guild = interaction.guild;

        if (!gameConfig || !guild) {
            return interaction.editReply({
                content: '❌ Could not find that game configuration.',
                components: []
            });
        }

        // Look up role from cache first, falling back to API fetch
        const role = guild.roles.cache.get(gameConfig.roleId)
            || await guild.roles.fetch(gameConfig.roleId).catch(() => null);

        if (!role) {
            return interaction.editReply({
                content: `❌ The role **${gameConfig.label}** could not be found on this server.`,
                components: []
            });
        }

        // Fetch all members so offline members are included
        await guild.members.fetch();

        const members = guild.members.cache
            .filter(member => member.roles.cache.has(role.id))
            .map(member => member.displayName || member.user.username)
            .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

        const embed = new EmbedBuilder()
            .setTitle(`${gameConfig.label} – Player Roster`)
            .setColor(role.color || 0x5865F2) // Uses the Discord role's color, or Blurple fallback
            .setDescription(
                members.length > 0
                    ? members.join('\n')
                    : '*No players currently have this role.*'
            )
            .setFooter({ text: `Total players: ${members.length}` });

        await interaction.editReply({
            content: '',
            embeds: [embed],
            components: []
        });
    }
};
