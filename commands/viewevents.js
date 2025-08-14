const { SlashCommandBuilder } = require('discord.js');
const { loadEvents } = require('../utils/eventStorage');

function paginate(array, page_size, page_number) {
  return array.slice((page_number - 1) * page_size, page_number * page_size);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('viewevents')
    .setDescription('View all upcoming events and their bookings')
    .addIntegerOption(option =>
      option.setName('page')
        .setDescription('Page number to view')
        .setRequired(false)
    ),

  async execute(interaction) {
    const events = loadEvents();

    if (events.length === 0) {
      await interaction.reply({ content: 'There are no events scheduled.', ephemeral: true });
      return;
    }

    events.sort((a, b) => new Date(a.date) - new Date(b.date));

    const pageSize = 5;
    const page = interaction.options.getInteger('page') || 1;
    const totalPages = Math.ceil(events.length / pageSize);

    if (page < 1 || page > totalPages) {
      await interaction.reply({ content: `Invalid page number. Please choose between 1 and ${totalPages}.`, ephemeral: true });
      return;
    }

    const eventsPage = paginate(events, pageSize, page);

    let reply = `**📅 Upcoming Events (Page ${page}/${totalPages})**\n\n`;

    for (const event of eventsPage) {
      const bookings = Array.isArray(event.bookings) ? event.bookings : [];

      // Create a readable booking list
      const bookingList = bookings.length > 0
        ? bookings.map(b => `• ${b.displayName || b.username || b.playerNames}`).join('\n')
        : '_No bookings yet_';

      reply += `**${event.name}** — ${event.date}\n`;
      reply += `${event.description || '_No description_'}\n`;
      reply += `**Bookings:**\n${bookingList}\n\n`;
    }

    await interaction.reply(reply);
  }
};