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
const eventManager = require('../utils/eventManager');

const activeBookFlows = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('book')
        .setDescription('Book or join a wargaming table for Thursday club nights or special events'),

    async execute(interaction) {
        const typeMenu = new StringSelectMenuBuilder()
            .setCustomId('book_select_type')
            .setPlaceholder('📂 Select what you would like to book...')
            .addOptions([
                { label: 'Thursday Club Night', value: 'thursday', description: 'Book a table for a regular Thursday night', emoji: '🍺' },
                { label: 'Special Club Event', value: 'event', description: 'Book or join a table for an upcoming weekend event', emoji: '📅' }
            ]);

        await interaction.reply({
            content: '🎲 **Wargaming Table Booking**\nStep 1: What type of gaming night are you booking for?',
            components: [new ActionRowBuilder().addComponents(typeMenu)],
            ephemeral: true
        });
    },

    async handleSelectMenu(interaction) {
        // --- STEP 1: Choose Type (Thursday vs Event) ---
        if (interaction.customId === 'book_select_type') {
            await interaction.deferUpdate();
            const type = interaction.values[0];
            activeBookFlows.set(interaction.user.id, { type });

            if (type === 'thursday') {
                const options = [];
                let d = new Date();
                for (let i = 0; i < 6; i++) {
                    const day = d.getDay();
                    const diff = (4 - day + 7) % 7; // 4 = Thursday
                    d.setDate(d.getDate() + diff);
                    if (i === 0 && day > 4) d.setDate(d.getDate() + 7);
                    
                    const dateStr = d.toISOString().split('T')[0];
                    options.push(new StringSelectMenuOptionBuilder().setLabel(dateStr).setValue(dateStr));
                    d.setDate(d.getDate() + 7);
                }

                const thursdayMenu = new StringSelectMenuBuilder()
                    .setCustomId('book_thursday_date')
                    .setPlaceholder('📅 Select Thursday date...')
                    .addOptions(options);

                await interaction.editReply({
                    content: '🍺 **Thursday Night Booking**\nSelect date:',
                    components: [new ActionRowBuilder().addComponents(thursdayMenu)]
                });
            } else if (type === 'event') {
                const events = eventManager.getUpcomingEvents();
                if (events.length === 0) {
                    return interaction.editReply({ 
                        content: '❌ There are currently no upcoming special events scheduled.', 
                        components: [] 
                    });
                }

                const eventMenu = new StringSelectMenuBuilder()
                    .setCustomId('book_event_date')
                    .setPlaceholder('📅 Select event date...')
                    .addOptions(
                        events.map(e => new StringSelectMenuOptionBuilder().setLabel(e.label).setValue(e.value))
                    );

                await interaction.editReply({
                    content: '📅 **Special Event Booking**\nSelect event date:',
                    components: [new ActionRowBuilder().addComponents(eventMenu)]
                });
            }
        }

        // --- BRANCH A: Thursday Booking Steps ---
        else if (interaction.customId === 'book_thursday_date') {
            await interaction.deferUpdate();
            const flow = activeBookFlows.get(interaction.user.id) || {};
            flow.date = interaction.values[0];
            activeBookFlows.set(interaction.user.id, flow);

            const userSelect = new UserSelectMenuBuilder()
                .setCustomId('book_thursday_players')
                .setPlaceholder('👥 Select/tag players for your table (Max 8)...')
                .setMinValues(1)
                .setMaxValues(8);

            await interaction.editReply({
                content: `🍺 **Thursday Night Booking** (${flow.date})\nSelect or tag the players for this table:`,
                components: [new ActionRowBuilder().addComponents(userSelect)]
            });
        }

        // --- BRANCH B: Event Booking Steps ---
        else if (interaction.customId === 'book_event_date') {
            await interaction.deferUpdate();
            const flow = activeBookFlows.get(interaction.user.id) || {};
            flow.date = interaction.values[0];
            activeBookFlows.set(interaction.user.id, flow);

            const slotMenu = new StringSelectMenuBuilder()
                .setCustomId('book_event_slot')
                .setPlaceholder('⏱️ Select time slot...')
                .addOptions([
                    { label: 'Morning (AM)', value: 'AM', description: '09:00 - 13:00' },
                    { label: 'Afternoon (PM)', value: 'PM', description: '13:30 - 17:30' },
                    { label: 'Whole Day', value: 'Whole Day', description: '09:00 - 17:30' }
                ]);

            await interaction.editReply({
                content: `📅 **Event Booking** (${flow.date})\nSelect time slot:`,
                components: [new ActionRowBuilder().addComponents(slotMenu)]
            });
        }
        else if (interaction.customId === 'book_event_slot') {
            await interaction.deferUpdate();
            const flow = activeBookFlows.get(interaction.user.id) || {};
            flow.slot = interaction.values[0];
            activeBookFlows.set(interaction.user.id, flow);

            const joinable = eventManager.getJoinableTables(flow.date, flow.slot);
            const actionOptions = [
                { label: 'Start a New Table', value: 'create', description: 'Reserve a fresh table slot for your game', emoji: '➕' }
            ];

            if (joinable.length > 0) {
                joinable.forEach(t => {
                    actionOptions.push({
                        label: `Join Table ${t.tableNumber}: ${t.gameName}`,
                        description: `Host: ${t.organizer} (${t.currentPlayers}/${t.maxPlayers} players)`,
                        value: `join_${t.tableNumber}`
                    });
                });
            }

            const actionMenu = new StringSelectMenuBuilder()
                .setCustomId('book_event_action')
                .setPlaceholder('🎲 Start a new table or join an existing one...')
                .addOptions(actionOptions.map(opt => new StringSelectMenuOptionBuilder(opt)));

            await interaction.editReply({
                content: `📅 **Event Booking** (${flow.date} — ${flow.slot})\nChoose action:`,
                components: [new ActionRowBuilder().addComponents(actionMenu)]
            });
        }
        else if (interaction.customId === 'book_event_action') {
            const flow = activeBookFlows.get(interaction.user.id) || {};
            const val = interaction.values[0];

            if (val === 'create') {
                await interaction.deferUpdate();
                flow.action = 'create';
                activeBookFlows.set(interaction.user.id, flow);

                const userSelect = new UserSelectMenuBuilder()
                    .setCustomId('book_event_players')
                    .setPlaceholder('👥 Tag players joining your initial roster (Max 8)...')
                    .setMinValues(1)
                    .setMaxValues(8);

                await interaction.editReply({
                    content: `📅 **New Event Table** (${flow.date} — ${flow.slot})\nSelect or tag player roster:`,
                    components: [new ActionRowBuilder().addComponents(userSelect)]
                });
            } else if (val.startsWith('join_')) {
                const tableNum = parseInt(val.replace('join_', ''));
                try {
                    const nickname = interaction.guild 
                        ? (await interaction.guild.members.fetch(interaction.user.id)).displayName 
                        : interaction.user.username;
                    
                    eventManager.joinBooking(flow.date, tableNum, flow.slot, interaction.user.id, nickname);
                    activeBookFlows.delete(interaction.user.id);

                    await interaction.update({
                        content: `🎉 **Successfully joined Table ${tableNum}!**\nYou have been added to the roster for ${flow.date} (${flow.slot}).`,
                        components: []
                    });
                } catch (err) {
                    await interaction.update({ content: `❌ ${err.message}`, components: [] });
                }
            }
        }
    },

    async handleUserSelect(interaction) {
        const flow = activeBookFlows.get(interaction.user.id);
        if (!flow) {
            return interaction.reply({ content: '❌ Session expired. Please run `/book` again.', ephemeral: true });
        }

        const selectedUsers = interaction.users;
        const roster = [];

        for (const [userId, user] of selectedUsers) {
            const member = interaction.guild ? await interaction.guild.members.fetch(userId).catch(() => null) : null;
            const displayName = member ? member.displayName : user.username;
            roster.push({ id: userId, name: displayName });
        }

        flow.roster = roster;
        activeBookFlows.set(interaction.user.id, flow);

        if (interaction.customId === 'book_thursday_players') {
            const modal = new ModalBuilder()
                .setCustomId('book_thursday_modal')
                .setTitle('Thursday Table Details');

            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('modal_game')
                        .setLabel('Game System / Title')
                        .setPlaceholder('e.g. Warhammer 40k, BattleTech, Star Wars Shatterpoint')
                        .setRequired(true)
                        .setStyle(TextInputStyle.Short)
                )
            );

            return interaction.showModal(modal);
        } else if (interaction.customId === 'book_event_players') {
            const modal = new ModalBuilder()
                .setCustomId('book_event_modal')
                .setTitle('Event Table Setup');

            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('modal_game')
                        .setLabel('Game System / Title')
                        .setPlaceholder('e.g. Marvel Crisis Protocol')
                        .setRequired(true)
                        .setStyle(TextInputStyle.Short)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('modal_max_players')
                        .setLabel('Max Players Allowed (Default 8)')
                        .setValue('8')
                        .setRequired(true)
                        .setStyle(TextInputStyle.Short)
                )
            );

            return interaction.showModal(modal);
        }
    },

    async handleModalSubmit(interaction) {
        await interaction.deferReply({ ephemeral: true });
        const flow = activeBookFlows.get(interaction.user.id);

        if (!flow) {
            return interaction.editReply({ content: '❌ Session expired. Please run `/book` again.' });
        }

        const gameName = interaction.fields.getTextInputValue('modal_game').trim();
        const roster = flow.roster || [{ id: interaction.user.id, name: interaction.user.username }];
        const primaryHost = roster[0];
        const mentions = roster.map(p => `<@${p.id}>`).join(', ');

        try {
            if (interaction.customId === 'book_thursday_modal') {
                const playerNamesString = roster.map(p => p.name).join(', ');
                const res = tableManager.addReservation(
                    primaryHost.id, 
                    primaryHost.name, 
                    playerNamesString, 
                    gameName, 
                    flow.date, 
                    'Evening 18:00-22:00'
                );

                const tableNum = (typeof res === 'object' && res !== null) ? (res.tableNumber || res.table || res) : res;

                activeBookFlows.delete(interaction.user.id);
                await interaction.editReply({
                    content: `✅ **Thursday Reservation Confirmed!**\nReserved **Table ${tableNum}** on **${flow.date}** for ${mentions} playing **${gameName}**.`
                });
            } else if (interaction.customId === 'book_event_modal') {
                const maxPlayers = parseInt(interaction.fields.getTextInputValue('modal_max_players').trim()) || 8;
                const tableNum = eventManager.createBooking(
                    flow.date, 
                    flow.slot, 
                    primaryHost.id, 
                    primaryHost.name, 
                    gameName, 
                    maxPlayers, 
                    roster
                );

                activeBookFlows.delete(interaction.user.id);
                await interaction.editReply({
                    content: `🎉 **Event Table Created!**\nReserved **Table ${tableNum}** (${flow.slot}) on **${flow.date}** for ${mentions} playing **${gameName}** (Max Capacity: ${maxPlayers}).`
                });
            }
        } catch (err) {
            await interaction.editReply({ content: `❌ ${err.message}` });
        }
    }
};
