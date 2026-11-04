const { SlashCommandBuilder } = require('discord.js');
const { loadEvents, saveEvents } = require('../utils/eventStorage');
const tableManager = require('../utils/tableManager');
const { isValidDate } = require('../utils/dateUtils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('createevent')
    .setDescription('Create a new club event (Admin only)')
    .addStringOption(option =>
      option.setName('name').setDescription('Name of the event').setRequired(true))
    .addStringOption(option =>
      option.setName('date').setDescription('Date of the event (YYYY-MM-DD)').setRequired(true))
    .addStringOption(option =>
      option.setName('description').setDescription('Optional description').setRequired(false))
    .setDMPermission(false),

  async execute(interaction) {
    const isAdmin = await tableManager.checkIfUserIsAdmin(interaction.user.id, interaction);
    if (!isAdmin) {
      await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
      return;
    }

    const name = interaction.options.getString('name').trim();
    const date = interaction.options.getString('date').trim();
    const description = interaction.options.getString('description')?.trim() || '';

    if (!isValidDate(date)) {
      await interaction.reply({ content: '❌ Please provide a valid calendar date in YYYY-MM-DD format.', ephemeral: true });
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    if (date < today) {
      await interaction.reply({ content: '❌ You cannot create an event for a date in the past.', ephemeral: true });
      return;
    }

    let events = loadEvents();
    if (events.find(ev => ev.name.toLowerCase() === name.toLowerCase())) {
      await interaction.reply({ content: `❌ An event named "${name}" already exists.`, ephemeral: true });
      return;
    }

    const newEvent = {
      id: Date.now().toString(),
      name,
      date,
      description,
      maxTables: 15,
      bookings: [],
      createdAt: new Date().toISOString()
    };

    events.push(newEvent);
    saveEvents(events);

    await interaction.reply(`✅ Event **"${name}"** scheduled for **${date}** has been created.`);
  }
};
