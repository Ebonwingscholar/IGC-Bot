const { SlashCommandBuilder } = require('discord.js');
const {
  getEvents,
  getEventByName,
  getBookingByUserAndEvent,
  removeBookingByUserAndEvent,
} = require('../utils/eventStorage');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('canceleventbooking')
    .setDescription('Cancel your booking for a specific event')
    .addStringOption(option =>
      option.setName('eventname')
        .setDescription('The name of the event')
        .setRequired(true)
        .setAutocomplete(true)
    ),

  async autocomplete(interaction) {
    const focusedValue = (interaction.options.getFocused() || '').toLowerCase();
    const events = getEvents();

    const filtered = (focusedValue
      ? events.filter(e => e.name.toLowerCase().includes(focusedValue))
      : events
    ).slice(0, 25);

    await interaction.respond(
      filtered.map(e => ({ name: `${e.name} (${e.date})`, value: e.name }))
    );
  },

  async execute(interaction) {
    const userId = interaction.user.id;
    const eventName = interaction.options.getString('eventname');

    const event = getEventByName(eventName);
    if (!event) {
      await interaction.reply({ content: `Event "${eventName}" not found.`, ephemeral: true });
      return;
    }

    const booking = getBookingByUserAndEvent(userId, eventName);
    if (!booking) {
      await interaction.reply({ content: `You don't have a booking for "${eventName}".`, ephemeral: true });
      return;
    }

    const removed = removeBookingByUserAndEvent(userId, eventName);
    if (!removed) {
      await interaction.reply({ content: `Failed to cancel your booking for "${eventName}". Please try again.`, ephemeral: true });
      return;
    }

    await interaction.reply(`Your booking for **${eventName}** has been cancelled.`);
  }
};