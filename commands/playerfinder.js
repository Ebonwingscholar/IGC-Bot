const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    EmbedBuilder
} = require('discord.js');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../data/player-finder.json');
const pendingAdminDeletes = new Map();

// Initial default games (seeded into data/player-finder.json on first run)
const DEFAULT_GAMES = [
    { key: '40k', label: 'Warhammer 40k', roleId: '1446511133228929056' },
    { key: 'aos', label: 'Age of Sigmar', roleId: '1446510570403532890' },
    { key: 'killteam', label: 'Kill Team', roleId: '1403387824841162752' },
    { key: 'other', label: 'All Other Games', roleId: '1446548080630698056' }
];

function isAdmin(interaction) {
    return Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild));
}

function slugifyGameKey(label) {
    return label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 40) || `game_${Date.now()}`;
}

function loadStore() {
    if (!fs.existsSync(DATA_FILE)) {
        return { games: null, rosters: {} };
    }
    try {
        const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        // Migrate older flat structure if present
        if (!parsed.games && !parsed.rosters) {
            return { games: null, rosters: parsed };
        }
        return {
            games: Array.isArray(parsed.games) ? parsed.games : null,
            rosters: parsed.rosters || {}
        };
    } catch (err) {
        console.error('Error reading player-finder.json:', err);
        return { games: null, rosters: {} };
    }
}

function saveStore(store) {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), 'utf8');
}

function getGameList() {
    const store = loadStore();
    if (!store.games) {
        store.games = [...DEFAULT_GAMES];
        saveStore(store);
    }
    return store.games;
}

// Seeds existing Discord role holders once if the game key hasn't been initialized yet
async function getOrSeedGameRoster(guild, gameConfig) {
    const store = loadStore();
    if (!store.games) {
        store.games = [...DEFAULT_GAMES];
    }

    if (!store.rosters[gameConfig.key]) {
        store.rosters[gameConfig.key] = {};

        if (guild && gameConfig.roleId) {
            const role = guild.roles.cache.get(gameConfig.roleId)
                || await guild.roles.fetch(gameConfig.roleId).catch(() => null);

            if (role) {
                await guild.members.fetch().catch(() => null);
                const roleMembers = guild.members.cache.filter(m => !m.user.bot && m.roles.cache.has(role.id));

                for (const [memberId, member] of roleMembers) {
                    store.rosters[gameConfig.key][memberId] = {
                        name: member.displayName || member.user.username,
                        details: '',
                        updatedAt: new Date().toISOString()
                    };
                }
            }
        }

        saveStore(store);
    }

    return store.rosters[gameConfig.key];
}

async function buildRosterPayload(guild, gameConfig, viewerId) {
    const roster = await getOrSeedGameRoster(guild, gameConfig);
    const entries = Object.entries(roster).map(([uid, info]) => ({
        userId: uid,
        name: info.name || uid,
        details: (info.details || '').trim()
    }));

    entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    let roleColor = 0x5865F2;
    if (guild && gameConfig.roleId) {
        const role = guild.roles.cache.get(gameConfig.roleId);
        if (role && role.color) roleColor = role.color;
    }

    const lines = entries.map(entry => {
        return entry.details
            ? `• **${entry.name}** — *${entry.details}*`
            : `• **${entry.name}**`;
    });

    let description = lines.length > 0
        ? lines.join('\n')
        : '*No players listed yet. Click **Join Roster** below to add yourself!*';
    if (description.length > 4000) {
        description = `${description.slice(0, 3950)}\n*...and more*`;
    }

    const isJoined = Boolean(roster[viewerId]);

    const embed = new EmbedBuilder()
        .setTitle(`🎲 ${gameConfig.label} — Player Finder`)
        .setColor(roleColor)
        .setDescription(description)
        .setFooter({ text: `Total players: ${entries.length}` });

    const joinOrEditBtn = new ButtonBuilder()
        .setCustomId(`playerfinder_join_${gameConfig.key}`)
        .setLabel(isJoined ? 'Edit My Details' : 'Join Roster')
        .setStyle(isJoined ? ButtonStyle.Primary : ButtonStyle.Success)
        .setEmoji(isJoined ? '✏️' : '➕');

    const buttons = [joinOrEditBtn];

    if (isJoined) {
        buttons.push(
            new ButtonBuilder()
                .setCustomId(`playerfinder_leave_${gameConfig.key}`)
                .setLabel('Leave Roster')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('➖')
        );
    }

    const row = new ActionRowBuilder().addComponents(buttons);

    return {
        content: '',
        embeds: [embed],
        components: [row]
    };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('playerfinder')
        .setDescription('Find club players by game, share your armies/preferences, or join/leave a roster'),

    async execute(interaction) {
        if (!interaction.guild) {
            return interaction.reply({
                content: '❌ This command can only be used inside the server.',
                ephemeral: true
            });
        }

        const adminUser = isAdmin(interaction);
        const games = getGameList();
        const maxGameSlots = adminUser ? 23 : 25;

        const options = games.slice(0, maxGameSlots).map(game =>
            new StringSelectMenuOptionBuilder()
                .setLabel(game.label)
                .setValue(game.key)
        );

        if (adminUser) {
            if (games.length < 23) {
                options.push(
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Admin: Add New Game')
                        .setDescription('Add a new game system to the Player Finder list')
                        .setValue('__admin_add_game__')
                        .setEmoji('➕')
                );
            }
            if (games.length > 0) {
                options.push(
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Admin: Remove a Game')
                        .setDescription('Remove a game system and its roster from the list')
                        .setValue('__admin_remove_game__')
                        .setEmoji('🗑️')
                );
            }
        }

        const menu = new StringSelectMenuBuilder()
            .setCustomId('playerfinder_select_game')
            .setPlaceholder('🎲 Select a game to view or join its roster...')
            .addOptions(options);

        await interaction.reply({
            content: '🎲 **Player Finder**\nChoose a game to see who plays, view their armies/notes, or add yourself to the list:',
            components: [new ActionRowBuilder().addComponents(menu)],
            ephemeral: true
        });
    },

    async handleSelectMenu(interaction) {
        // --- MAIN DROPDOWN: Game Selected (or Admin Add/Remove) ---
        if (interaction.customId === 'playerfinder_select_game') {
            const selected = interaction.values[0];

            // Admin: Add New Game -> Open Modal
            if (selected === '__admin_add_game__') {
                if (!isAdmin(interaction)) {
                    return interaction.reply({ content: '❌ Only admins can add games.', ephemeral: true });
                }

                const modal = new ModalBuilder()
                    .setCustomId('playerfinder_admin_add_game_modal')
                    .setTitle('Add Game to Player Finder');

                modal.addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('modal_game_label')
                            .setLabel('Game Name')
                            .setPlaceholder('e.g. BattleTech, Marvel Crisis Protocol, Bolt Action')
                            .setMaxLength(80)
                            .setRequired(true)
                            .setStyle(TextInputStyle.Short)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('modal_game_role_id')
                            .setLabel('Discord Role ID (Optional)')
                            .setPlaceholder('Leave blank unless you want to link & sync a Discord role')
                            .setMaxLength(30)
                            .setRequired(false)
                            .setStyle(TextInputStyle.Short)
                    )
                );

                return interaction.showModal(modal);
            }

            // Admin: Remove a Game -> Pick Game to Remove
            if (selected === '__admin_remove_game__') {
                if (!isAdmin(interaction)) {
                    return interaction.reply({ content: '❌ Only admins can remove games.', ephemeral: true });
                }

                const games = getGameList();
                if (games.length === 0) {
                    return interaction.update({ content: '⚠️ There are no games to remove.', components: [] });
                }

                const store = loadStore();
                const removeMenu = new StringSelectMenuBuilder()
                    .setCustomId('playerfinder_admin_remove_select')
                    .setPlaceholder('🗑️ Select game to remove...')
                    .addOptions(
                        games.slice(0, 25).map(g => {
                            const count = Object.keys(store.rosters[g.key] || {}).length;
                            return new StringSelectMenuOptionBuilder()
                                .setLabel(g.label)
                                .setDescription(`${count} player(s) currently listed`)
                                .setValue(g.key);
                        })
                    );

                return interaction.update({
                    content: '🗑️ **Remove Game from Player Finder**\nSelect which game system you want to remove:',
                    components: [new ActionRowBuilder().addComponents(removeMenu)]
                });
            }

            // Standard Player Flow: View Selected Game Roster
            await interaction.deferUpdate();

            const games = getGameList();
            const gameConfig = games.find(g => g.key === selected);

            if (!gameConfig) {
                return interaction.editReply({
                    content: '❌ Could not find that game configuration.',
                    components: []
                });
            }

            const payload = await buildRosterPayload(interaction.guild, gameConfig, interaction.user.id);
            return interaction.editReply(payload);
        }

        // --- ADMIN: Confirm Game Removal ---
        else if (interaction.customId === 'playerfinder_admin_remove_select') {
            if (!isAdmin(interaction)) {
                return interaction.update({ content: '❌ Only admins can remove games.', components: [] });
            }

            const targetKey = interaction.values[0];
            const games = getGameList();
            const targetGame = games.find(g => g.key === targetKey);

            if (!targetGame) {
                return interaction.update({ content: '❌ Game not found.', components: [] });
            }

            pendingAdminDeletes.set(interaction.user.id, targetKey);

            const confirmMenu = new StringSelectMenuBuilder()
                .setCustomId('playerfinder_admin_remove_confirm')
                .setPlaceholder('⚠️ Confirm game removal...')
                .addOptions([
                    {
                        label: `Yes, remove "${targetGame.label}"`,
                        value: 'confirm',
                        description: 'Deletes this game and its Player Finder roster',
                        emoji: '⚠️'
                    },
                    {
                        label: 'No, keep this game',
                        value: 'cancel',
                        description: 'Abort and leave the list unchanged',
                        emoji: '↩️'
                    }
                ]);

            return interaction.update({
                content: `⚠️ **Are you sure?**\nYou are about to remove **${targetGame.label}** and its roster from \`/playerfinder\`.`,
                components: [new ActionRowBuilder().addComponents(confirmMenu)]
            });
        }

        // --- ADMIN: Execute Game Removal ---
        else if (interaction.customId === 'playerfinder_admin_remove_confirm') {
            const choice = interaction.values[0];
            const targetKey = pendingAdminDeletes.get(interaction.user.id);
            pendingAdminDeletes.delete(interaction.user.id);

            if (!isAdmin(interaction) || choice !== 'confirm' || !targetKey) {
                return interaction.update({
                    content: '↩️ Cancelled — no games were removed.',
                    components: []
                });
            }

            const store = loadStore();
            if (!store.games) store.games = [...DEFAULT_GAMES];

            const removedGame = store.games.find(g => g.key === targetKey);
            store.games = store.games.filter(g => g.key !== targetKey);
            delete store.rosters[targetKey];
            saveStore(store);

            return interaction.update({
                content: `✅ Removed **${removedGame ? removedGame.label : targetKey}** from \`/playerfinder\`.`,
                components: []
            });
        }
    },

    async handleButton(interaction) {
        const id = interaction.customId;

        // Join or Edit Details -> Open Modal
        if (id.startsWith('playerfinder_join_')) {
            const gameKey = id.replace('playerfinder_join_', '');
            const games = getGameList();
            const gameConfig = games.find(g => g.key === gameKey);

            if (!gameConfig) {
                return interaction.reply({ content: '❌ Game not found.', ephemeral: true });
            }

            const store = loadStore();
            const existingDetails = store.rosters[gameKey]?.[interaction.user.id]?.details || '';

            const modal = new ModalBuilder()
                .setCustomId(`playerfinder_modal_${gameKey}`)
                .setTitle(`${gameConfig.label} Roster`.slice(0, 45));

            const detailsInput = new TextInputBuilder()
                .setCustomId('modal_player_details')
                .setLabel('Armies, game size, or notes (Optional)')
                .setPlaceholder('e.g. Space Marines & Necrons, 2000pt games, weekday evenings')
                .setStyle(TextInputStyle.Paragraph)
                .setMaxLength(200)
                .setRequired(false);

            if (existingDetails) {
                detailsInput.setValue(existingDetails);
            }

            modal.addComponents(new ActionRowBuilder().addComponents(detailsInput));
            return interaction.showModal(modal);
        }

        // Leave Roster -> Remove & Refresh Embed
        if (id.startsWith('playerfinder_leave_')) {
            await interaction.deferUpdate();

            const gameKey = id.replace('playerfinder_leave_', '');
            const games = getGameList();
            const gameConfig = games.find(g => g.key === gameKey);

            if (!gameConfig) {
                return interaction.editReply({ content: '❌ Game not found.', components: [] });
            }

            const store = loadStore();
            if (store.rosters[gameKey] && store.rosters[gameKey][interaction.user.id]) {
                delete store.rosters[gameKey][interaction.user.id];
                saveStore(store);
            }

            if (interaction.guild && gameConfig.roleId) {
                const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
                if (member && member.roles.cache.has(gameConfig.roleId)) {
                    await member.roles.remove(gameConfig.roleId).catch(() => null);
                }
            }

            const payload = await buildRosterPayload(interaction.guild, gameConfig, interaction.user.id);
            return interaction.editReply(payload);
        }
    },

    async handleModalSubmit(interaction) {
        // --- ADMIN: Add New Game Modal Submit ---
        if (interaction.customId === 'playerfinder_admin_add_game_modal') {
            if (!isAdmin(interaction)) {
                return interaction.reply({ content: '❌ Only admins can add games.', ephemeral: true });
            }

            const label = interaction.fields.getTextInputValue('modal_game_label').trim();
            const rawRoleId = interaction.fields.getTextInputValue('modal_game_role_id').trim();

            if (!label) {
                return interaction.reply({ content: '❌ Please enter a game name.', ephemeral: true });
            }

            if (rawRoleId && !/^\d{17,20}$/.test(rawRoleId)) {
                return interaction.reply({
                    content: '❌ That Discord Role ID does not look valid (it should be a 17–20 digit number, or leave it blank).',
                    ephemeral: true
                });
            }

            const store = loadStore();
            if (!store.games) store.games = [...DEFAULT_GAMES];

            if (store.games.some(g => g.label.toLowerCase() === label.toLowerCase())) {
                return interaction.reply({
                    content: `⚠️ **${label}** is already in the Player Finder list.`,
                    ephemeral: true
                });
            }

            if (store.games.length >= 23) {
                return interaction.reply({
                    content: '⚠️ Maximum of 23 games reached (Discord dropdown limit). Remove an unused game first.',
                    ephemeral: true
                });
            }

            let key = slugifyGameKey(label);
            let suffix = 2;
            while (store.games.some(g => g.key === key)) {
                key = `${slugifyGameKey(label)}_${suffix++}`;
            }

            store.games.push({
                key,
                label,
                roleId: rawRoleId || null
            });
            saveStore(store);

            return interaction.reply({
                content: `✅ Added **${label}** to \`/playerfinder\`!${rawRoleId ? ` (Linked to role <@&${rawRoleId}>)` : ''}`,
                ephemeral: true
            });
        }

        // --- PLAYER: Join / Update Details Modal Submit ---
        if (!interaction.customId.startsWith('playerfinder_modal_')) return;

        await interaction.deferUpdate();

        const gameKey = interaction.customId.replace('playerfinder_modal_', '');
        const games = getGameList();
        const gameConfig = games.find(g => g.key === gameKey);

        if (!gameConfig) {
            return interaction.followUp({ content: '❌ Game not found.', ephemeral: true });
        }

        const details = interaction.fields.getTextInputValue('modal_player_details').trim();
        const member = interaction.guild
            ? await interaction.guild.members.fetch(interaction.user.id).catch(() => null)
            : null;
        const displayName = member ? member.displayName : interaction.user.username;

        const store = loadStore();
        if (!store.games) store.games = [...DEFAULT_GAMES];
        if (!store.rosters[gameKey]) {
            store.rosters[gameKey] = {};
        }

        store.rosters[gameKey][interaction.user.id] = {
            name: displayName,
            details,
            updatedAt: new Date().toISOString()
        };
        saveStore(store);

        if (interaction.guild && gameConfig.roleId && member && !member.roles.cache.has(gameConfig.roleId)) {
            await member.roles.add(gameConfig.roleId).catch(() => null);
        }

        const payload = await buildRosterPayload(interaction.guild, gameConfig, interaction.user.id);
        return interaction.editReply(payload);
    }
};
