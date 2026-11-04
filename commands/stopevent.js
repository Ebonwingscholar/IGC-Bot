const { SlashCommandBuilder } = require('discord.js');
const { loadEvents, getEventByName, deleteEvent } = require('../utils/eventStorage');
const tableManager = require('../utils/tableManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stopevent')
    .setDescription('Admin: Cancel and delete an entire event')
    .addStringOption(option =>
      option.setName('eventname').setDescription('Event to cancel').setRequired(true).setAutocomplete(true)),

  async execute(interaction) {
    const isAdmin = await tableManager.checkIfUserIsAdmin(interaction.user.id, interaction);
    if (!isAdmin) {
      await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
      return;
    }

    const eventName = interaction.options.getString('eventname');
    const event = getEventByName(eventName);
    if (!event) {
      await interaction.reply({ content: `Event "${eventName}" not found.`, ephemeral: true });
      return;
    }

    const success = deleteEvent(eventName);
    if (success) {
      await interaction.reply({ content: `Event "${eventName}" has been cancelled and removed.`, ephemeral: true });
    } else {
      await interaction.reply({ content: `Failed to cancel event "${eventName}".`, ephemeral: true });
    }
  },

  async autocomplete(interaction) {
    const focusedValue = (interaction.options.getFocused() || '').toLowerCase();
    const events = loadEvents();
    const filtered = (focusedValue
      ? events.filter(e => e.name.toLowerCase().includes(focusedValue))
      : events
    ).slice(0, 25);

    await interaction.respond(
      filtered.map(e => ({ name: `${e.name} (${e.date})`, value: e.name }))
    );
  }
};
