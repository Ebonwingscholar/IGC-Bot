const { 
    SlashCommandBuilder, 
    ActionRowBuilder, 
    StringSelectMenuBuilder, 
    StringSelectMenuOptionBuilder,
    EmbedBuilder 
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const tableManager = require('../utils/tableManager');
const eventManager = require('../utils/eventManager');

const activeViewFlows = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('view')
        .setDescription('View current table reservations for Thursday nights or special events'),

    async execute(interaction) {
        const typeMenu = new StringSelectMenuBuilder()
            .setCustomId('view_select_type')
            .setPlaceholder('📂 Select what schedule to view...')
            .addOptions([
                { label: 'Thursday Club Night', value: 'thursday', description: 'View bookings for upcoming Thursday club nights', emoji: '🍺' },
                { label: 'Special Club Event', value: 'event', description: 'View bookings for upcoming weekend events', emoji: '📅' }
            ]);

        await interaction.reply({
            content: '🔍 **Table Reservations Schedule**\nStep 1: Select event type:',
            components: [new ActionRowBuilder().addComponents(typeMenu)],
            ephemeral: true
        });
    },

    async handleSelectMenu(interaction) {
        // --- STEP 1: Choose Type (Thursday vs Event) ---
        if (interaction.customId === 'view_select_type') {
            await interaction.deferUpdate();
            const type = interaction.values[0];
            activeViewFlows.set(interaction.user.id, { type });

            if (type === 'thursday') {
                const options = [];
                const now = new Date();
                const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

                let closedDates = [];
                const closedFilePath = path.join(__dirname, '../data/closed-dates.json');
                try {
                    if (fs.existsSync(closedFilePath)) {
                        closedDates = JSON.parse(fs.readFileSync(closedFilePath, 'utf8'));
                    }
                } catch (err) {
                    console.error('Error reading closed-dates.json:', err);
                }

                const formatDate = (dObj) => {
                    const y = dObj.getFullYear();
                    const m = String(dObj.getMonth() + 1).padStart(2, '0');
                    const d = String(dObj.getDate()).padStart(2, '0');
                    return `${y}-${m}-${d}`;
                };

                // Anchor date: 5th Nov 2026 (Month 10 = Nov)
                let currentThursday = new Date(2026, 10, 5);

                while (formatDate(currentThursday) < todayStr) {
                    currentThursday.setDate(currentThursday.getDate() + 14);
                }

                while (options.length < 3) {
                    const dateStr = formatDate(currentThursday);
                    if (!closedDates.includes(dateStr)) {
                        options.push(new StringSelectMenuOptionBuilder().setLabel(dateStr).setValue(dateStr));
                    }
                    currentThursday.setDate(currentThursday.getDate() + 14);
                }

                const thursdayMenu = new StringSelectMenuBuilder()
                    .setCustomId('view_thursday_date')
                    .setPlaceholder('📅 Select Thursday date...')
                    .addOptions(options);

                await interaction.editReply({
                    content: '🍺 **Thursday Night Schedule**\nSelect date to view:',
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
                    .setCustomId('view_event_date')
                    .setPlaceholder('📅 Select event date...')
                    .addOptions(
                        events.map(e => new StringSelectMenuOptionBuilder().setLabel(e.label).setValue(e.value))
                    );

                await interaction.editReply({
                    content: '📅 **Special Event Schedule**\nSelect event date to view:',
                    components: [new ActionRowBuilder().addComponents(eventMenu)]
                });
            }
        }

        // --- STEP 2: Render Embed Output for Selected Date ---
        else if (interaction.customId === 'view_thursday_date') {
            const dateStr = interaction.values[0];
            activeViewFlows.delete(interaction.user.id);

            const dayRes = tableManager.getAllReservations(dateStr);
            const totalTables = tableManager.MAX_TABLES || 10;
            const reservedCount = dayRes.length;
            const freeCount = Math.max(0, totalTables - reservedCount);

            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(`🍺 Thursday Night Schedule — ${dateStr}`)
                .setDescription(`**Capacity:** ${reservedCount}/${totalTables} tables reserved (${freeCount} available)`)
                .setTimestamp();

            if (dayRes.length === 0) {
                embed.addFields({ 
                    name: 'No Tables Reserved', 
                    value: 'There are no tables booked yet for this night. Use `/book` to reserve the first table!' 
                });
            } else {
                dayRes.forEach(res => {
                    embed.addFields({
                        name: `Table ${res.tableNumber} — ${res.gameName}`,
                        value: `**Host:** ${res.username}\n**Roster:** ${res.playerNames}\n**Session:** ${res.session || 'Evening 18:00-22:00'}`
                    });
                });
            }

            // Acknowledge step 1 quietly and post embed publicly for everyone to see
            await interaction.update({ content: '✅ Viewing schedule generated below.', components: [] });
            await interaction.followUp({ embeds: [embed], ephemeral: false });
        }

        else if (interaction.customId === 'view_event_date') {
            const dateStr = interaction.values[0];
            activeViewFlows.delete(interaction.user.id);

            // Retrieve all bookings for this event date across all time slots
            const eventBookings = typeof eventManager.getBookingsForDate === 'function' 
                ? eventManager.getBookingsForDate(dateStr) 
                : (eventManager.getAllBookings ? eventManager.getAllBookings(dateStr) : []);

            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(`📅 Special Event Schedule — ${dateStr}`)
                .setTimestamp();

            if (!eventBookings || eventBookings.length === 0) {
                embed.setDescription('There are no table bookings currently registered for this event date.');
            } else {
                embed.setDescription(`Showing all active table bookings for **${dateStr}** across all sessions:`);
                eventBookings.forEach(b => {
                    const playerList = Array.isArray(b.players) ? b.players.map(p => p.name || p).join(', ') : (b.playerNames || 'N/A');
                    const slotInfo = b.slot ? ` (${b.slot})` : '';
                    const capacityInfo = b.maxPlayers ? ` [${b.currentPlayers || (Array.isArray(b.players) ? b.players.length : 1)}/${b.maxPlayers}]` : '';

                    embed.addFields({
                        name: `Table ${b.tableNumber}${slotInfo} — ${b.gameName}${capacityInfo}`,
                        value: `**Host:** ${b.organizer || b.username}\n**Roster:** ${playerList}`
                    });
                });
            }

            // Acknowledge step 1 quietly and post embed publicly for everyone to see
            await interaction.update({ content: '✅ Viewing schedule generated below.', components: [] });
            await interaction.followUp({ embeds: [embed], ephemeral: false });
        }
    }
};
