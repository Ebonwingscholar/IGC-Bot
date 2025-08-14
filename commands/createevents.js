const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { loadEvents, saveEvents } = require('../utils/eventStorage');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('createevent')
    .setDescription('Create a new club event')
    .addStringOption(option =>
      option.setName('name')
        .setDescription('Name of the event')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('date')
        .setDescription('Date of the event (YYYY-MM-DD)')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('description')
        .setDescription('Optional description for the event')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild) // ✅ Admin-only
    .setDMPermission(false),

  async execute(interaction) {
    const name = interaction.options.getString('name').trim();
    const date = interaction.options.getString('date').trim();
    const description = interaction.options.getString('description')?.trim() || '';

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      await interaction.reply({ content: '❌ Please provide the date in YYYY-MM-DD format.', ephemeral: true });
      return;
    }

    let events = loadEvents();

    // Check for duplicate name
    if (events.find(ev => ev.name.toLowerCase() === name.toLowerCase())) {
      await interaction.reply({ content: `❌ An event with the name "${name}" already exists.`, ephemeral: true });
      return;
    }

    // ✅ Create new event with empty bookings array
    const newEvent = {
      id: Date.now().toString(),
      name,
      date,
      description,
      bookings: [], // NEW: ensures this is always present
      createdAt: new Date().toISOString()
    };

    events.push(newEvent);
    saveEvents(events);

    await interaction.reply(`✅ Event **"${name}"** scheduled for **${date}** has been created.`);
  }
};